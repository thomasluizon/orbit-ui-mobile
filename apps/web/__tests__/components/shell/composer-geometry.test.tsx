import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360, 412, 450, 480, 600, 1023].flatMap((width) =>
  [en, ptBR].flatMap((messages) => ['', 'Astra '.repeat(10)].map((value) => ({ width, messages, value }))),
)

describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  const measurements: { width: number; placeholder: string; composing: boolean; contentWidth: number }[] = []
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
  })
  afterAll(async () => {
    await closeChrome(browserLaunch)
    writeFileSync(join(tmpdir(), 'orbit-composer-widths.json'), JSON.stringify(measurements, null, 2))
  }, 30_000)

  it.each(['idle', 'sending', 'offline', 'atLimit', 'transcribing', 'recording'] as const)(
    'paints hover only on enabled attachment and voice controls while %s', async (state) => {
      const status = state === 'offline' || state === 'atLimit'
        ? { state, limitReason: en.shell.composer.offline.reason }
        : { state }
      const { container } = render(<Composer {...status} value="" suggestions={[]}
        words={en.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onVoice={vi.fn()} voiceWords={en.shell.composer.voice}
        onAttachFile={vi.fn()} onAttachImage={vi.fn()}
        attachWords={{ file: en.chat.attachFile, image: en.chat.attachImage, trayLabel: en.chat.attachFile, remove: (name) => name }} />)
      const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
        const controls = page.locator('[data-composer-controls] button')
        expect(await controls.count()).toBe(['recording', 'transcribing'].includes(state) ? 1 : 3)
        for (const control of await controls.all()) {
          await page.mouse.move(0, 0)
          const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
          const bounds = (await control.boundingBox())!
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
          await page.waitForTimeout(300)
          const hoveredFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
          if (await control.isDisabled()) expect(hoveredFill).toBe(restingFill)
          else expect(hoveredFill).not.toBe(restingFill)
        }
      } finally { await page.close() }
    },
  )

  it.each([320, 360, 412, 600])('fully reveals long suggestion chips after scrolling and resizing from $0', async (width) => {
    const chips = buildComposerChips({
      surface: 'progress', status: 'success', totalHabitCount: 1,
      habits: [createMockHabit({ title: 'Read a longer book chapter '.repeat(8), linkedGoals: [] })],
      profile: createMockProfile({ currentStreak: 0, longestStreak: 1 }),
    })
    const suggestions = toComposerSuggestions(chips.map(({ id, params }) => ({
      id,
      label: en.shell.composer.chips.progress[id.replace('progress.', '') as keyof typeof en.shell.composer.chips.progress].replace('{title}', params?.title ?? ''),
      onSelect: vi.fn(),
    })))
    const { container } = render(<Composer state="idle" value="" suggestions={suggestions}
      words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const viewportWidth of [width, 840, width]) {
        await page.setViewportSize({ width: viewportWidth, height: 740 })
        const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
        for (const control of await strip.getByRole('button').all()) {
          await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
          await control.focus()
          const measured = await control.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const scroller = element.parentElement!.getBoundingClientRect()
            const label = element.querySelector('span')!
            return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
              scrollerLeft: scroller.left, scrollerRight: scroller.right,
              labelHeight: label.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(label).lineHeight) }
          })
          expect(measured.width).toBeGreaterThanOrEqual(44)
          expect(measured.height).toBeGreaterThanOrEqual(44)
          expect(measured.left).toBeGreaterThanOrEqual(measured.scrollerLeft)
          expect(measured.right).toBeLessThanOrEqual(measured.scrollerRight)
          expect(measured.labelHeight).toBeLessThanOrEqual(measured.lineHeight)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewportWidth)
      }
      expect(await page.getByRole('button', { name: suggestions[0]!.label, exact: true }).getAttribute('aria-label')).toBe(suggestions[0]!.label)
    } finally { await page.close() }
  })

  it.each(cases)('keeps usable text at $width with value "$value" and $messages.shell.composer.placeholder', async ({ width, messages, value }) => {
    const { container } = render(<Composer
      state="idle" value={value} suggestions={[]}
      words={messages.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()}
      onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation}
      onVoice={vi.fn()} voiceWords={messages.shell.composer.voice}
      onAttachFile={vi.fn()} onAttachImage={vi.fn()}
      attachWords={{ file: messages.chat.attachFile, image: messages.chat.attachImage, trayLabel: messages.chat.attachFile, remove: (name) => name }}
    />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-composer-input]')!
        const style = getComputedStyle(input)
        const placeholderStyle = getComputedStyle(input, '::placeholder')
        return {
          contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          clientHeight: input.clientHeight,
          scrollHeight: input.scrollHeight,
          placeholderWhiteSpace: placeholderStyle.whiteSpace,
          whiteSpace: style.whiteSpace,
          documentWidth: document.documentElement.scrollWidth,
          controlGroupRight: document.querySelector('[data-composer-controls]')!.getBoundingClientRect().right,
          fieldRight: input.parentElement!.getBoundingClientRect().right - parseFloat(getComputedStyle(input.parentElement!).paddingRight),
          controls: [...document.querySelectorAll('button')].map((button) => {
            const bounds = button.getBoundingClientRect()
            return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right }
          }),
        }
      })
      measurements.push({ width, placeholder: messages.shell.composer.placeholder, composing: value.length > 0, contentWidth: measured.contentWidth })
      expect(measured.contentWidth, JSON.stringify(measured)).toBeGreaterThanOrEqual(width === 320 ? 140 : 160)
      expect(measured.documentWidth).toBe(width)
      expect(measured.controlGroupRight).toBeCloseTo(measured.fieldRight, 0)
      if (!value) {
        expect(measured.scrollHeight, JSON.stringify(measured)).toBe(measured.clientHeight)
        expect(measured.placeholderWhiteSpace).toBe('nowrap')
      } else {
        expect(measured.whiteSpace).toBe('pre-wrap')
      }
      for (const control of measured.controls) {
        expect(control.width).toBeGreaterThanOrEqual(44)
        expect(control.height).toBeGreaterThanOrEqual(44)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(width)
      }
    } finally { await page.close() }
  })
})
