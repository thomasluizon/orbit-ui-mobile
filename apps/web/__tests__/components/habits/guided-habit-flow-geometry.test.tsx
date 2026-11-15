import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { QuestionRow } from '@/components/ui/question-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))

const HEIGHT = 915

function Step({ messages }: Readonly<{ messages: typeof ptBR }>) {
  const flow = messages.habits.flow
  return (
    <div style={{ height: HEIGHT, display: 'flex', flexDirection: 'column' }}>
      <QuestionFlow flow="habit_create" stepKey="when" direction={1} question={flow.when.question} line={flow.when.line} position={2} total={4}
        progressLabel={flow.progress.replace('{position}', '2').replace('{total}', '4')} backLabel={flow.back} closeLabel={flow.close} onBack={() => {}} onClose={() => {}}
        options={<>
          <OptionCard label={flow.when.today} onSelect={() => {}} />
          <OptionCard label={flow.when.tomorrow} onSelect={() => {}} />
          <OptionCard label={flow.when.everyDay} onSelect={() => {}} />
          <OptionCard label={flow.when.noDate} onSelect={() => {}} />
        </>}
        primary={{ label: flow.continue, onPress: () => {} }} />
    </div>
  )
}

describe('the guided habit flow block in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function measure(width: number, messages: typeof ptBR) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') || width >= Number(query.match(/min-width: (\d+)px/)?.[1] ?? Infinity), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<Step messages={messages} />)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0">${view.container.innerHTML}</body></html>`)
      return await page.evaluate(() => {
        const header = document.querySelector('[data-question-flow] header')!.getBoundingClientRect()
        const main = document.querySelector('[data-question-flow] main')!.getBoundingClientRect()
        const block = document.querySelector('[data-question-flow] main > div')!.getBoundingClientRect()
        const primary = document.querySelector('[data-flow-primary] button')!.getBoundingClientRect()
        const options = document.querySelector('[data-question-flow] [data-option-group]')!.getBoundingClientRect()
        const button = document.querySelector<HTMLElement>('[data-flow-primary] button')!
        const label = document.createRange()
        label.selectNodeContents(button)
        const buttonStyle = getComputedStyle(button)
        const hugWidth = label.getBoundingClientRect().width + Number.parseFloat(buttonStyle.paddingLeft) + Number.parseFloat(buttonStyle.paddingRight)
        return { header: { bottom: header.bottom }, main: { top: main.top, bottom: main.bottom, left: main.left, right: main.right }, block: { top: block.top, bottom: block.bottom, left: block.left, right: block.right }, options: { bottom: options.bottom }, primary: { top: primary.top, left: primary.left, right: primary.right, width: primary.width, hugWidth } }
      })
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  }

  it.each([320, 360, 384, 412].flatMap((width) => [{ width, locale: 'pt-BR', messages: ptBR }, { width, locale: 'en', messages: en as typeof ptBR }]))(
    'centres the block between the header and the pinned primary action at $width px in $locale', async ({ width, messages }) => {
      const geometry = await measure(width, messages)
      const freeCentre = (geometry.main.top + geometry.main.bottom) / 2
      const blockCentre = (geometry.block.top + geometry.block.bottom) / 2
      expect(Math.abs(blockCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.primary.top).toBeGreaterThanOrEqual(geometry.main.bottom)
    })

  it('centres the block in the content column on wide, with the primary action 24 under it and at most 360 wide', async () => {
    const geometry = await measure(1352, ptBR)
    const columnCentre = (geometry.main.left + geometry.main.right) / 2
    expect(Math.abs((geometry.block.left + geometry.block.right) / 2 - columnCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(Math.abs((geometry.block.top + geometry.block.bottom) / 2 - (geometry.main.top + geometry.main.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(geometry.block.right - geometry.block.left).toBeLessThanOrEqual(592)
    expect(geometry.primary.width).toBeLessThanOrEqual(360)
    expect(Math.abs(geometry.primary.width - geometry.primary.hugWidth), `the wide primary action hugs its label: ${JSON.stringify(geometry.primary)}`).toBeLessThanOrEqual(1)
    expect(Math.abs((geometry.primary.left + geometry.primary.right) / 2 - columnCentre), `the wide primary action sits in the centre under the block: ${JSON.stringify(geometry.primary)}`).toBeLessThanOrEqual(1)
    expect(Math.round(geometry.primary.top - geometry.options.bottom)).toBe(24)
  })

  it.each([320, 412])('keeps the primary action full width in the compact shell at %i px', async (width) => {
    const geometry = await measure(width, ptBR)
    expect(Math.round(geometry.primary.width)).toBe(width - 32)
  })

  it.each([320, 412].flatMap((width) => [{ width, locale: 'pt-BR', messages: ptBR }, { width, locale: 'en', messages: en as typeof ptBR }]))(
    'keeps a long list of chosen names on one line of its optional row at $width px in $locale', async ({ width, messages }) => {
      const view = render(<div style={{ padding: 16 }}><QuestionRow question={messages.habits.flow.optional.tags} value="Saúde, Trabalho, Casa, Estudos e Família" onPress={() => {}} /></div>)
      const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
      try {
        await page.setContent(`<!DOCTYPE html><html class="dark"><style>${stylesheet}</style><body style="margin:0">${view.container.innerHTML}</body></html>`)
        const value = await page.evaluate(() => {
          const node = document.querySelector<HTMLElement>('[data-question-value]')!
          const range = document.createRange()
          range.selectNodeContents(node)
          return { lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, clipped: node.scrollWidth > node.clientWidth, overflow: getComputedStyle(node).textOverflow, text: node.textContent }
        })
        expect(value, JSON.stringify(value)).toMatchObject({ lines: 1, clipped: true, overflow: 'ellipsis', text: 'Saúde, Trabalho, Casa, Estudos e Família' })
      } finally { await page.close(); view.unmount() }
    })
})
