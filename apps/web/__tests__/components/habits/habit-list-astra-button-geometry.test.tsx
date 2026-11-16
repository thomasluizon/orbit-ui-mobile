import { afterAll, beforeAll, expect, it } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { measureShellScrollEnd } from '@/e2e/layout/shell-scroll-extent'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { buildHabitListScrollAssets } from '@/__tests__/support/habit-list-scroll-assets'

let browser: Browser
let launch: BrowserLaunch | undefined
let stylesheet: string
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => { ({ stylesheet, script } = await buildHabitListScrollAssets()) }, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each([390, 840])('clears the stacked Astra button at the end of the real habit list at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><style>${stylesheet}</style><div id="root" data-count="100" data-astra></div>` }))
    await page.goto('https://habit-list.test/')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 100)
    const button = page.locator('[data-astra-button]')
    await button.waitFor({ state: 'visible' })
    const resting = (await button.boundingBox())!
    for (const dragged of [false, true]) {
      if (dragged) {
        await page.mouse.move(resting.x + 30, resting.y + 30)
        await page.mouse.down()
        await page.mouse.move(resting.x + 30, 400, { steps: 8 })
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      const measured = await page.locator('[data-shell-scroller]').evaluate(measureShellScrollEnd)
      const box = (await button.boundingBox())!
      expect(box, JSON.stringify({ dragged, box, resting })).toEqual(resting)
      expect(measured.lastTop).toBeGreaterThanOrEqual(measured.scrollerTop)
      expect(box.y - measured.lastBottom, JSON.stringify({ dragged, box, measured })).toBeGreaterThanOrEqual(SPACING.s16 - 1)
      expect(measured.scrollerBottom - measured.lastBottom).toBeCloseTo(measured.padding, 0)
      expect(await page.locator('[data-composer-root]').count()).toBe(0)
      expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
    }
  } finally { await page.close() }
})

/** The root style of a page in `mode`: the app reads its mode from the root `color-scheme`, then writes the matching tokens itself. */
function rootStyle(mode: 'light' | 'dark'): string {
  return [`color-scheme:${mode}`, ...Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`)].join(';')
}

/** Every distinct stack of painted layers under a 5 by 5 grid over the entry's 48 mascot, from the canvas up and without the
 *  entry itself, at each `step` px offset of the shell scroller. Runs in the page as one call, because one browser round trip
 *  per offset spends the test timeout. The habit list does not virtualize and nothing paints from a scroll event, so the hit
 *  test reads the new offset as soon as `scrollTop` changes. */
function layersUnderMascotAtEveryOffset(entry: Element, step: number): string[] {
  const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
  const mascot = entry.querySelector('svg[data-asset="orbit-mascot"]')!
  const layers = (node: Element) => [null, '::before', '::after'].flatMap(pseudo => {
    const style = getComputedStyle(node, pseudo)
    return (pseudo && style.content === 'none') || style.opacity === '0' || style.visibility === 'hidden' ? [] : [style.backgroundColor]
  })
  const stacks = new Set<string>()
  const end = scroller.scrollHeight - scroller.clientHeight
  for (let offset = 0; offset <= end; offset += step) {
    scroller.scrollTop = offset
    const bounds = mascot.getBoundingClientRect()
    for (let index = 0; index < 25; index += 1) {
      const point = [bounds.left + 4 + (index % 5) * 10, bounds.top + 4 + Math.floor(index / 5) * 10] as const
      stacks.add(JSON.stringify(document.elementsFromPoint(...point).filter(node => !entry.contains(node)).reverse().flatMap(layers).filter(color => !/^rgba\(.*, 0\)$/.test(color))))
    }
  }
  return [...stacks]
}

it.each(['light', 'dark'] as const)('reads the conversation entry Orbit at 3:1 against every surface the real habit list scrolls behind it in %s', async mode => {
  const page = await browser.newPage({ viewport: { width: 390, height: 915 }, reducedMotion: 'reduce' })
  try {
    const theme = rootStyle(mode)
    await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><html class="${mode}" style="${theme}"><style>${stylesheet}</style><div id="root" data-count="100" data-astra></div></html>` }))
    await page.goto('https://habit-list.test/')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 100)
    const button = page.locator('[data-astra-button]')
    await button.waitFor({ state: 'visible' })
    expect(await page.evaluate(() => document.documentElement.classList.contains(document.documentElement.style.colorScheme))).toBe(true)
    const paint = await button.evaluate(element => {
      const mascot = element.querySelector('svg[data-asset="orbit-mascot"]')!
      return { body: getComputedStyle(mascot).color, moon: getComputedStyle(mascot.querySelector('[data-part="moon"]')!).fill }
    })
    const surfaces = (await button.evaluate(layersUnderMascotAtEveryOffset, 17)).map(stack => JSON.parse(stack) as string[])
    expect(surfaces.length, 'the rows pass behind the entry').toBeGreaterThan(1)
    const below = surfaces.flatMap(layers => [['body', paint.body], ['moon', paint.moon]].flatMap(([part, color]) => {
      const ratio = contrastOnSurface(color!, layers)
      return ratio >= 3 ? [] : [`${part} ${color} on ${layers.join(' > ')}: ${ratio.toFixed(3)}`]
    }))
    expect(below).toEqual([])
  } finally { await page.close() }
})
