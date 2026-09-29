import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { Input } from '@/components/ui/input'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import {
  closeChrome,
  registerChromeLaunchHook,
  type Browser,
  type BrowserLaunch,
} from '@/__tests__/support/chromium'

type Pixel = readonly [number, number, number]
type FieldState = 'rest' | 'error' | 'focus'

const RINGS: Record<FieldState, { width: number; token: `--${string}` }> = {
  rest: { width: 1, token: '--border-control' },
  error: { width: 2, token: '--status-bad' },
  focus: { width: 2, token: '--primary' },
}

const CHROME_AUTOFILL_FILL = { light: 'rgb(232, 240, 254)', dark: 'rgba(70, 90, 126, 0.4)' } as const

async function readStrip(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<Pixel[]> {
  const shot = await page.screenshot({ clip })
  const channels = await page.evaluate(async (source) => {
    const image = new Image()
    image.src = `data:image/png;base64,${source}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Missing 2d context')
    context.drawImage(image, 0, 0)
    return Array.from(context.getImageData(0, 0, image.width, image.height).data)
  }, shot.toString('base64'))
  return Array.from({ length: channels.length / 4 }, (_, index) => [channels[index * 4]!, channels[index * 4 + 1]!, channels[index * 4 + 2]!] as const)
}

async function paintOver(page: Page, base: Pixel, token: string): Promise<Pixel> {
  const [red, green, blue] = await page.evaluate(([below, name]) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Missing 2d context')
    context.fillStyle = `rgb(${below.join(',')})`
    context.fillRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
  }, [base, token] as const)
  return [red!, green!, blue!]
}

function expectPixel(actual: Pixel, expected: Pixel, where: string) {
  const drift = Math.max(...actual.map((channel, index) => Math.abs(channel - expected[index]!)))
  expect(drift, `${where}: painted rgb(${actual.join(',')}), expected rgb(${expected.join(',')})`).toBeLessThanOrEqual(2)
}

async function expectOnePerimeterEdge(page: Page, row: readonly Pixel[], state: FieldState, edge: string) {
  const ring = RINGS[state]
  const inside = row[ring.width + 2]!
  const perimeter = await paintOver(page, inside, ring.token)
  for (let offset = 0; offset < ring.width; offset += 1) expectPixel(row[offset]!, perimeter, `${edge} perimeter pixel ${offset}`)
  for (let offset = ring.width; offset < row.length; offset += 1) expectPixel(row[offset]!, inside, `${edge} fill pixel ${offset}`)
}

async function forceControlState(page: Page, pseudoClasses: string[]) {
  if (pseudoClasses.length === 0) return
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument')
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input' })
  await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudoClasses })
}

describe('Input perimeter over an autofilled control in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await browserLaunch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    stylesheet = compiled.css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  const cases = (['light', 'dark'] as const).flatMap((mode) =>
    (['rest', 'error', 'focus'] as const).flatMap((state) =>
      [false, true].flatMap((autofilled) => [false, true].map((trailing) => ({ mode, state, autofilled, trailing })))))

  it.each(cases)('draws one $state perimeter in $mode, autofilled=$autofilled, trailing=$trailing', async ({ mode, state, autofilled, trailing }) => {
    const { container } = render(
      <Input
        label="Email"
        kind="email"
        name="email"
        autoComplete="email"
        value="person@example.com"
        onChange={() => {}}
        error={state === 'error' ? 'Enter a valid email.' : undefined}
        trailing={trailing ? <span className="block size-4" /> : undefined}
      />,
    )
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
    const page = await browser.newPage()
    try {
      await page.setContent(`<html class="${mode}" style="${variables}"><head><style>${stylesheet}</style></head><body style="margin:0;padding:48px;width:360px">${container.innerHTML}</body></html>`)
      await forceControlState(page, [...(autofilled ? ['autofill'] : []), ...(state === 'focus' ? ['focus', 'focus-visible'] : [])])
      const fill = await page.$eval('input', (input) => getComputedStyle(input).backgroundColor)
      expect(fill).toBe(autofilled ? CHROME_AUTOFILL_FILL[mode] : 'rgba(0, 0, 0, 0)')
      const box = await page.$eval('[data-focus-perimeter]', (field) => field.getBoundingClientRect().toJSON() as DOMRect)
      const row = Math.floor(box.top + box.height / 2)
      const column = Math.floor(box.left + box.width / 2)
      await expectOnePerimeterEdge(page, await readStrip(page, { x: box.left, y: row, width: 10, height: 1 }), state, 'left')
      await expectOnePerimeterEdge(page, (await readStrip(page, { x: box.right - 10, y: row, width: 10, height: 1 })).reverse(), state, 'right')
      await expectOnePerimeterEdge(page, await readStrip(page, { x: column, y: box.top, width: 1, height: 10 }), state, 'top')
      await expectOnePerimeterEdge(page, (await readStrip(page, { x: column, y: box.bottom - 10, width: 1, height: 10 })).reverse(), state, 'bottom')
    } finally {
      await page.close()
    }
  })
})
