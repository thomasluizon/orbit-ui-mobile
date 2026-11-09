import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AstraButton } from '@/components/shell/astra-button'
import { ShellWide } from '@/components/shell/shell-wide'
import { Fab } from '@/components/ui/fab'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectFillShape } from '@/e2e/layout/label-interaction-fill'
import { readControlPaint } from '@/e2e/layout/control-paint'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { INTERACTION_FILL_CLEARANCE, SPACING } from '@orbit/shared/theme'
import { ASTRA_BUTTON_GAP } from '@orbit/shared/utils'
import { compileComposerGeometry } from '@/__tests__/support/composer-geometry'
import type { Page } from '@playwright/test'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
let launch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
let composerScript: string
registerChromeLaunchHook(beforeAll, async next => { launch = next; browser = await next })
beforeAll(async () => {
  ;({ stylesheet, composerScript } = await compileComposerGeometry())
})
afterAll(async () => { await closeChrome(launch) }, 30_000)

it.each(['light', 'dark'] as const)('paints a distinct neutral hover and press surface in %s', async mode => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ testSurface: 'astraEntry', value: '', suggestions: [], words: {} })}</script></html>`)
    await page.addScriptTag({ content: composerScript })
    const control = page.locator('[data-astra-button]')
    await control.waitFor()
    await page.mouse.move(0, 0)
    const restingSurface = await control.evaluate(element => getComputedStyle(element).backgroundColor)
    const resting = await control.evaluate(readControlPaint)
    await control.hover()
    expect(await control.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(restingSurface)
    expect((await control.evaluate(readControlPaint)).background).not.toBe(resting.background)
    await expectFillShape(control, 'hover')
    await page.mouse.down()
    expect((await control.evaluate(readControlPaint)).background).not.toBe(resting.background)
    await expectFillShape(control, 'press')
    await page.mouse.move(0, 0)
    await page.mouse.up()
  } finally { await page.close() }
})

it.each([320, 412, 600])('restores the real stacked entry after pointer activation at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ testSurface: 'astraEntry', value: '', suggestions: [], words: {} })}</script>`)
    await page.addScriptTag({ content: composerScript })
    const controls = page.locator('[data-astra-button]')
    await controls.waitFor()
    expect(await inspectControls(page, controls, 'stacked entry', INTERACTION_FILL_CLEARANCE)).toEqual({ inspectedControls: 1, skippedSentinels: 0 })
    expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
    expect(await controls.isVisible()).toBe(true)
  } finally { await page.close() }
})

function astraEntry(configuration: Record<string, unknown> = {}) {
  return `<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ testSurface: 'astraEntry', value: '', suggestions: [], words: {}, ...configuration })}</script>`
}

async function mountAstraEntry(page: Page, configuration: Record<string, unknown> = {}, wrap = (content: string) => content) {
  await page.route('https://astra-entry.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>${wrap(astraEntry(configuration))}` }))
  await page.goto('https://astra-entry.test/')
  await page.addScriptTag({ content: composerScript })
  await page.locator('[data-astra-button]').waitFor()
  await settleFrames(page)
}

function settleFrames(page: Page) {
  return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

function measureStack() {
  const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
  const button = rect('[data-astra-button]')
  const create = rect('[data-shell-fab] button')
  return { top: button.top, bottom: button.bottom, left: button.left, right: button.right, width: button.width, height: button.height,
    createTop: create.top, createLeft: create.left, createRight: create.right, createWidth: create.width, tabsTop: rect('[data-shell-tab-bar]').top,
    conversations: document.querySelectorAll('[data-shell-conversation]').length }
}

function stackedShell(fab = true) {
  return renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 48 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    astraButton={<AstraButton />} fab={fab ? <Fab label="Create" onClick={() => {}}>+</Fab> : undefined}>
    {Array.from({ length: 40 }, (_, index) => <div key={index} data-probe-row="" style={{ height: 56 }}>Habit {index}</div>)}
  </ShellWide>)
}

it.each([320, 412, 840, 1000])('stacks directly above the create button, centred, with the shared gap at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const stack = await page.evaluate(measureStack)
    expect(stack.width).toBe(60)
    expect(stack.height).toBe(60)
    expect(stack.createTop - stack.bottom, JSON.stringify(stack)).toBe(ASTRA_BUTTON_GAP)
    expect(stack.left + stack.width / 2).toBe(stack.createLeft + stack.createWidth / 2)
    expect(stack.bottom).toBeLessThan(stack.tabsTop)
  } finally { await page.close() }
})

it.each([412, 840])('stays in place through a drag and opens Astra on tap at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const before = await page.evaluate(measureStack)
    await page.mouse.move(before.left + 30, before.top + 30)
    await page.mouse.down()
    await page.mouse.move(0, 0, { steps: 8 })
    await settleFrames(page)
    expect(await page.evaluate(measureStack)).toEqual(before)
    await page.mouse.up()
    await settleFrames(page)
    expect(await page.evaluate(measureStack)).toEqual(before)
    await page.locator('[data-astra-button]').click()
    expect(await page.locator('[data-shell-conversation]').count()).toBe(1)
  } finally { await page.close() }
})

it.each([412, 840])('takes the create button position when that button is absent at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${stackedShell()}`)
    const create = await page.evaluate(() => document.querySelector('[data-shell-fab] button')!.getBoundingClientRect().toJSON() as DOMRect)
    await page.setContent(`<style>${stylesheet}</style>${stackedShell(false)}`)
    const alone = await page.evaluate(() => document.querySelector('[data-astra-button]')!.getBoundingClientRect().toJSON() as DOMRect)
    expect(await page.locator('[data-shell-fab]').count()).toBe(0)
    expect({ left: alone.left, top: alone.top }).toEqual({ left: create.left, top: create.top })
  } finally { await page.close() }
})

it.each([390, 840])('scrolls the last row clear of both stacked buttons and the tab bar at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${stackedShell()}`)
    const geometry = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
      scroller.scrollTop = scroller.scrollHeight
      const last = [...document.querySelectorAll('[data-probe-row]')].at(-1)!.getBoundingClientRect()
      return { lastBottom: last.bottom, astraTop: document.querySelector('[data-astra-button]')!.getBoundingClientRect().top,
        tabsTop: document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect().top }
    })
    expect(geometry.astraTop - geometry.lastBottom, JSON.stringify(geometry)).toBeGreaterThanOrEqual(SPACING.s16)
    expect(geometry.lastBottom).toBeLessThan(geometry.tabsTop)
  } finally { await page.close() }
})

it.each([412, 840])('runs the resting compact Hoje list down to the tab bar at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page, { emptyNotice: true })
    const bounds = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      return { scrollerBottom: rect('[data-shell-scroller]').bottom, bottomTop: rect('[data-shell-bottom]').top, tabsTop: rect('[data-shell-tab-bar]').top }
    })
    expect(bounds.scrollerBottom, JSON.stringify(bounds)).toBe(bounds.tabsTop)
    expect(bounds.bottomTop).toBe(bounds.tabsTop)
  } finally { await page.close() }
})

const NOTICE_VERTICAL_PADDING = 12 + 24

it.each([[88, 64], [60, 60]])('holds the compact bottom minimum under a %ipx notice at %ipx', async (noticeHeight, minimum) => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page, { notice: 'Saved', noticeHeight: noticeHeight - NOTICE_VERTICAL_PADDING })
    const bounds = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>('[data-shell-bottom-viewport]')!
      return { minimum: Number.parseFloat(getComputedStyle(viewport).minHeight), content: viewport.firstElementChild!.getBoundingClientRect().height }
    })
    expect(bounds.content, JSON.stringify(bounds)).toBe(noticeHeight)
    expect(bounds.minimum, JSON.stringify(bounds)).toBe(minimum)
  } finally { await page.close() }
})

it('paints the server stack where the hydrated Hoje button sits', async () => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 112 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}><button style={{ minHeight: 48 }}>Tabs</button></nav>}
    notice={<><div /></>} astraButton={<AstraButton />} fab={<button style={{ width: 60, height: 60 }}>Create</button>}>
    <div style={{ height: 1600 }}>Habits</div>
  </ShellWide>)
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    const clearance = () => page.evaluate(() => document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect().top - document.querySelector('[data-astra-button]')!.getBoundingClientRect().bottom)
    await page.setContent(`<!DOCTYPE html><style>${stylesheet}</style>${markup}`)
    const fallback = await clearance()
    await mountAstraEntry(page, { emptyNotice: true })
    expect(await clearance()).toBe(fallback)
  } finally { await page.close() }
})

it('keeps clear of the tab bar at every scroll offset of a short landscape window', async () => {
  const page = await browser.newPage({ viewport: { width: 915, height: 412 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const scroll = (offset: number) => page.evaluate(top => { document.querySelector('[data-shell-destination-viewport]')!.scrollTop = top }, offset)
    const extent = await page.evaluate(() => {
      const viewport = document.querySelector('[data-shell-destination-viewport]')!
      return viewport.scrollHeight - viewport.clientHeight
    })
    expect(extent).toBeGreaterThan(0)
    for (const offset of [-10_000, 0, 10_000]) {
      await scroll(offset)
      await settleFrames(page)
      const geometry = await page.evaluate(measureStack)
      expect(geometry.tabsTop - (geometry.createTop + 60), JSON.stringify({ offset, ...geometry })).toBeGreaterThanOrEqual(0)
      expect(geometry.createTop - geometry.bottom).toBe(ASTRA_BUTTON_GAP)
    }
    await page.locator('[data-astra-button]').click()
    expect(await page.locator('[data-shell-conversation]').count()).toBe(1)
  } finally { await page.close() }
})

it.each([[740, 360], [915, 412], [840, 900]])('leaves the tab bar in view after every column control scrolls into view at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const geometry = await page.evaluate(() => {
      const column = document.querySelector('[data-shell-column]')!
      const controls = [...column.querySelectorAll<HTMLElement>('button')].filter(control => control.getBoundingClientRect().width > 1)
      for (const control of controls) control.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const button = document.querySelector('[data-astra-button]')!.getBoundingClientRect()
      return { controls: controls.map(control => control.textContent || control.getAttribute('aria-label')), tabsBottom: document.querySelector('[data-shell-bottom]')!.getBoundingClientRect().bottom,
        buttonRight: button.right, columnRight: column.getBoundingClientRect().right }
    })
    expect(geometry.controls).toContain('shell.astraButton.open')
    expect(geometry.tabsBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(height)
    expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.columnRight)
  } finally { await page.close() }
})

it('keeps the stack above a visible notice slot', async () => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page, { notice: 'Notice' })
    const geometry = await page.evaluate(() => ({ create: document.querySelector('[data-shell-fab] button')!.getBoundingClientRect().bottom,
      notice: document.querySelector('[data-shell-notice-content]')!.getBoundingClientRect().top }))
    expect(geometry.notice - geometry.create, JSON.stringify(geometry)).toBeGreaterThanOrEqual(SPACING.s16)
  } finally { await page.close() }
})

it.each(['light', 'dark'] as const)('rests with the hairline ring and shadow tokens, never the canvas ring, in %s', async mode => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'no-preference' })
  try {
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await mountAstraEntry(page, {}, content => `<html class="${mode}" style="${theme}">${content}</html>`)
    const control = page.locator('[data-astra-button]')
    const paint = () => control.evaluate(element => {
      const probe = document.createElement('i')
      probe.style.color = 'var(--bg)'
      document.body.append(probe)
      const canvas = getComputedStyle(probe).color
      probe.remove()
      return { shadow: getComputedStyle(element).boxShadow, ring: getComputedStyle(element.querySelector('[data-press-fill]')!).boxShadow, canvas, scale: getComputedStyle(element).scale }
    })
    const hairline = mode === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(9, 9, 11, 0.16)'
    const resting = await paint()
    expect(resting.shadow).not.toMatch(/0px 0px 0px 6px/)
    expect(resting.shadow).not.toContain(resting.canvas)
    expect(resting.shadow).toBe('rgba(0, 0, 0, 0.28) 0px 4px 16px 0px')
    expect(resting.ring).toContain(`${hairline} 0px 0px 0px 1px inset`)
    const box = (await control.boundingBox())!
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    await expect.poll(async () => (await paint()).scale).toBe('0.96')
    expect((await paint()).shadow).toBe(resting.shadow)
    expect((await paint()).ring).toBe(resting.ring)
    await page.mouse.move(0, 0)
    await page.mouse.up()
    await expect.poll(async () => (await paint()).scale).not.toBe('0.96')
    expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
  } finally { await page.close() }
})

it.each([740, 915])('reveals the first page control in a short %ipx window with stacked clearance', async width => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 112 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    astraButton={<AstraButton />} fab={<Fab label="Create" onClick={() => {}}>+</Fab>}>
    <button style={{ height: 48 }}>Today view</button><div style={{ height: 1600 }}>Habits</div>
  </ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 360 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${markup}`)
    const control = page.getByRole('button', { name: 'Today view' })
    await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const geometry = await control.evaluate(element => {
      const target = element.getBoundingClientRect()
      const scroller = element.closest('[data-shell-scroller]')!.getBoundingClientRect()
      return { top: target.top, bottom: target.bottom, viewportTop: Math.max(0, scroller.top), viewportBottom: Math.min(innerHeight, scroller.bottom) }
    })
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.viewportTop)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportBottom)
  } finally { await page.close() }
})

it.each([320, 412, 840].flatMap(width => (['light', 'dark'] as const).flatMap(mode => [1, 2].map(scale => ({ width, mode, scale })))))('clears create, tabs and back-to-top at $width in $mode with text scale $scale', async ({ width, mode, scale }) => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 48 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    scrollToTop={<button style={{ minHeight: 48 }}>Back to top</button>} astraButton={<AstraButton />}
    fab={<Fab label="Create" onClick={() => {}}>+</Fab>}><div style={{ height: 1600 }}>Habits</div></ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${theme};font-size:${16 * scale}px"><style>${stylesheet}</style>${markup}</html>`)
    const geometry = await page.evaluate(() => {
      const button = document.querySelector('[data-astra-button]')!.getBoundingClientRect()
      const create = document.querySelector('[data-shell-fab]')!.getBoundingClientRect()
      const top = document.querySelector('[data-shell-scroll-to-top]')!.getBoundingClientRect()
      const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
      return { width: button.width, height: button.height, left: button.left, right: button.right, top: button.top, bottom: button.bottom,
        createTop: create.top, createHeight: create.height, tabsTop: tabs.top, pillBottom: top.bottom,
        composers: document.querySelectorAll('[data-composer-root]').length }
    })
    expect(geometry.width).toBe(60)
    expect(geometry.height).toBe(60)
    expect(geometry.composers).toBe(0)
    expect(geometry.left).toBeGreaterThanOrEqual(16)
    expect(geometry.right).toBeLessThanOrEqual(width - 16)
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.pillBottom)
    expect(geometry.createTop - geometry.bottom).toBe(ASTRA_BUTTON_GAP)
    expect(geometry.bottom + 16).toBeLessThanOrEqual(geometry.tabsTop)
  } finally { await page.close() }
})

it('paints the server stack one bottom inset higher when the shell reserves that inset', async () => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 48 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    scrollToTop={<button style={{ minHeight: 48 }}>Back to top</button>} astraButton={<AstraButton />}
    fab={<Fab label="Create" onClick={() => {}}>+</Fab>}><div style={{ height: 1600 }}>Habits</div></ShellWide>)
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    const fallbackTop = async (inset: number) => {
      await page.setContent(`<html style="--safe-bottom:${inset}px"><style>${stylesheet}</style>${markup}</html>`)
      return page.evaluate(() => document.querySelector('[data-astra-button]')!.getBoundingClientRect().top)
    }
    const withoutInset = await fallbackTop(0)
    expect(await fallbackTop(34)).toBe(withoutInset - 34)
  } finally { await page.close() }
})

it.each([1024, 1280, 1352])('draws no Astra button in the wide shell at %ipx before or after hydration', async width => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 48 }}>Today</div>} astraButton={<AstraButton />}><div style={{ height: 1600 }}>Habits</div></ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${markup}`)
    expect(await page.locator('[data-astra-button]').isVisible()).toBe(false)
    expect(await page.locator('[data-shell-astra-row]').isVisible()).toBe(true)
  } finally { await page.close() }
})
