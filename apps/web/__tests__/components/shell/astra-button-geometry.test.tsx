import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AstraButton } from '@/components/shell/astra-button'
import { ShellWide } from '@/components/shell/shell-wide'
import { Fab } from '@/components/ui/fab'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectFillShape } from '@/e2e/layout/label-interaction-fill'
import { readControlPaint } from '@/e2e/layout/control-paint'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
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

it.each([320, 412, 600])('restores the real floating entry after pointer activation at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ testSurface: 'astraEntry', value: '', suggestions: [], words: {} })}</script>`)
    await page.addScriptTag({ content: composerScript })
    const controls = page.locator('[data-astra-button]')
    await controls.waitFor()
    expect(await inspectControls(page, controls, 'floating entry', INTERACTION_FILL_CLEARANCE)).toEqual({ inspectedControls: 1, skippedSentinels: 0 })
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
  await page.waitForFunction(() => document.querySelector('[data-astra-button-position]')?.getAttribute('style')?.includes('translate'))
  await settleFrames(page)
}

async function dragAstraButton(page: Page, x: number, y: number, release = true) {
  const box = (await page.locator('[data-astra-button]').boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 8 })
  await settleFrames(page)
  if (release) await page.mouse.up()
  await settleFrames(page)
}

function settleFrames(page: Page) {
  return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

function measureAstraBounds() {
  const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
  const button = rect('[data-astra-button]')
  return { top: button.top, bottom: button.bottom, left: button.left, right: button.right, scrollerTop: rect('[data-shell-scroller]').top,
    headerTop: rect('[data-shell-header]').top, tabsTop: rect('[data-shell-tab-bar]').top, contentLeft: rect('[data-shell-page-content]').left, conversations: document.querySelectorAll('[data-shell-conversation]').length }
}

it.each([412, 840])('drags over the whole compact screen and never onto the tab bar at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const control = page.locator('[data-astra-button]')
    await dragAstraButton(page, 0, 0)
    const top = await page.evaluate(measureAstraBounds)
    expect(top.top, JSON.stringify(top)).toBe(16)
    expect(top.left).toBe(top.contentLeft + 16)
    expect(top.top).toBeLessThan(top.scrollerTop)
    expect(top.bottom).toBeGreaterThan(top.headerTop)
    expect(top.conversations).toBe(0)
    await dragAstraButton(page, 0, 915)
    const bottom = await page.evaluate(measureAstraBounds)
    expect(bottom.tabsTop - bottom.bottom, JSON.stringify(bottom)).toBe(16)
    expect(bottom.left).toBe(bottom.contentLeft + 16)
    expect(bottom.conversations).toBe(0)
    await control.click()
    expect(await page.locator('[data-shell-conversation]').count()).toBe(1)
  } finally { await page.close() }
})

interface AstraPlacementRecord { style: string; top: number; left: number }

async function recordAstraPlacements(page: Page) {
  await page.route('https://astra-entry.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>${astraEntry()}` }))
  await page.goto('https://astra-entry.test/')
  await page.evaluate(() => {
    const placements: AstraPlacementRecord[] = []
    Object.assign(window, { placements })
    new MutationObserver(() => {
      const wrapper = document.querySelector<HTMLElement>('[data-astra-button-position]')
      const style = wrapper?.getAttribute('style') ?? ''
      if (!wrapper || !style.includes('translate') || placements.at(-1)?.style === style) return
      const bounds = wrapper.getBoundingClientRect()
      placements.push({ style, top: bounds.top, left: bounds.left })
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
  })
  await page.addScriptTag({ content: composerScript })
  await page.waitForFunction(() => (window as unknown as { placements: unknown[] }).placements.length > 0)
  await settleFrames(page)
}

async function readAstraPlacements(page: Page) {
  const placements = await page.evaluate(() => (window as unknown as { placements: AstraPlacementRecord[] }).placements)
  return placements.map(({ style, top, left }) => {
    const [, x, y] = style.match(/translate\(([\d.]+)px, ([\d.]+)px\)/)!
    return { committed: { top: Number(y), left: Number(x) }, painted: { top, left } }
  })
}

it('paints the first placement in the frame it commits under reduced motion', async () => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    await recordAstraPlacements(page)
    const [first] = await readAstraPlacements(page)
    expect(first!.painted.top, JSON.stringify(first)).toBeCloseTo(first!.committed.top, 1)
    expect(first!.painted.left, JSON.stringify(first)).toBeCloseTo(first!.committed.left, 1)
  } finally { await page.close() }
})

it.each([412, 840])('paints every drag frame where it commits and lands on the leading column edge under reduced motion at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await recordAstraPlacements(page)
    const box = (await page.locator('[data-astra-button]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(0, 0, { steps: 10 })
    await page.mouse.up()
    await settleFrames(page)
    const frames = await readAstraPlacements(page)
    expect(frames.length).toBeGreaterThan(2)
    for (const frame of frames) {
      expect(frame.painted.top, JSON.stringify(frame)).toBeCloseTo(frame.committed.top, 1)
      expect(frame.painted.left, JSON.stringify(frame)).toBeCloseTo(frame.committed.left, 1)
    }
    const top = await page.evaluate(measureAstraBounds)
    expect(top.top, JSON.stringify(top)).toBe(16)
    expect(top.left).toBe(top.contentLeft + 16)
    expect(top.conversations).toBe(0)
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
    await scroll(-10_000)
    await page.evaluate(() => document.querySelector('[data-shell-page-content]')!.append(document.createElement('span')))
    await settleFrames(page)
    await dragAstraButton(page, 0, 412)
    for (const offset of [-10_000, 0]) {
      await scroll(offset)
      await settleFrames(page)
      const geometry = await page.evaluate(measureAstraBounds)
      expect(geometry.tabsTop - geometry.bottom, JSON.stringify({ offset, ...geometry })).toBeGreaterThanOrEqual(16)
    }
    await dragAstraButton(page, 0, 0)
    const top = await page.evaluate(measureAstraBounds)
    expect(top.top).toBeLessThan(top.scrollerTop)
    expect(top.conversations).toBe(0)
    await page.locator('[data-astra-button]').click()
    expect(await page.locator('[data-shell-conversation]').count()).toBe(1)
  } finally { await page.close() }
})

it.each([412, 600, 740, 840, 1000])('rests on the create FAB trailing edge and snaps to the content column edges at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page)
    const edges = () => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      return { button: rect('[data-astra-button]'), fab: rect('[data-shell-fab] button'), column: rect('[data-shell-column]'), content: rect('[data-shell-page-content]') }
    })
    const resting = await edges()
    expect(resting.button.right, JSON.stringify(resting)).toBe(resting.fab.right)
    expect(resting.button.bottom + 24).toBeLessThanOrEqual(resting.fab.top)
    expect(resting.button.right).toBeLessThanOrEqual(resting.column.right)
    await dragAstraButton(page, width, 300, false)
    expect((await edges()).button.right).toBe(width - 16)
    await page.mouse.up()
    await settleFrames(page)
    expect((await edges()).button.right).toBe(resting.fab.right)
    await dragAstraButton(page, 0, 300)
    const leading = await edges()
    expect(leading.button.left).toBe(leading.content.left + 16)
    expect(leading.button.left).toBeGreaterThanOrEqual(leading.column.left)
    expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
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

it('stops above a visible notice slot', async () => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
  try {
    await mountAstraEntry(page, { notice: 'Notice' })
    await dragAstraButton(page, 0, 915)
    const geometry = await page.evaluate(() => ({ button: document.querySelector('[data-astra-button]')!.getBoundingClientRect().bottom,
      notice: document.querySelector('[data-shell-notice-content]')!.getBoundingClientRect().top }))
    expect(geometry.notice - geometry.button, JSON.stringify(geometry)).toBe(16)
  } finally { await page.close() }
})

it.each(['light', 'dark'] as const)('floats with the hairline ring and shadow tokens, never the canvas ring, in %s', async mode => {
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
    await page.mouse.move(200, 300, { steps: 8 })
    await expect.poll(async () => (await paint()).shadow).toBe('rgba(0, 0, 0, 0.45) 0px 12px 40px 0px')
    await expect.poll(async () => (await paint()).scale).toBe('1')
    expect((await paint()).ring).toBe(resting.ring)
    await page.mouse.up()
    await expect.poll(async () => (await paint()).shadow).toBe(resting.shadow)
    expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
  } finally { await page.close() }
})

it.each([740, 915])('reveals the first page control in a short %ipx window with floating clearance', async width => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 112 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    astraButton={<AstraButton />} fab={<Fab label="Create" onClick={() => {}}>+</Fab>}>
    <button style={{ height: 48 }}>Today view</button><div style={{ height: 1600 }}>Habits</div>
  </ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 360 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${markup}`)
    await page.evaluate(() => {
      const button = document.querySelector('[data-astra-button]')!.getBoundingClientRect()
      const page = document.querySelector<HTMLElement>('[data-shell-page]')!
      page.style.setProperty('--shell-astra-clearance', `${Math.max(0, page.getBoundingClientRect().bottom - button.top + 16)}px`)
    })
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
    expect(geometry.bottom + 24).toBeLessThanOrEqual(geometry.createTop)
    expect(geometry.bottom + 16).toBeLessThanOrEqual(geometry.tabsTop)
  } finally { await page.close() }
})

it('paints the server fallback one bottom inset higher when the floating shell reserves that inset', async () => {
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

it.each([1024, 1280, 1352])('draws no floating button in the wide shell at %ipx before or after hydration', async width => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 48 }}>Today</div>} astraButton={<AstraButton />}><div style={{ height: 1600 }}>Habits</div></ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${markup}`)
    expect(await page.locator('[data-astra-button]').isVisible()).toBe(false)
    expect(await page.locator('[data-shell-astra-row]').isVisible()).toBe(true)
  } finally { await page.close() }
})
