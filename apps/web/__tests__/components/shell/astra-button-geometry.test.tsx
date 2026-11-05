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

it.each([740, 915])('reveals the first page control in a short %ipx window with floating clearance', async width => {
  const markup = renderToString(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
    header={<div style={{ minHeight: 112 }}>Today</div>} tabBar={<nav style={{ minHeight: 80 }}>Tabs</nav>}
    astraButton={<AstraButton />} fab={<Fab label="Create" onClick={() => {}}>+</Fab>}>
    <button style={{ height: 48 }}>Today view</button><div style={{ height: 1600 }}>Habits</div>
  </ShellWide>)
  const page = await browser.newPage({ viewport: { width, height: 360 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<style>${stylesheet}</style>${markup}`)
    await page.locator('[data-shell-page]').evaluate(element => {
      const button = element.querySelector('[data-astra-button]')!.getBoundingClientRect()
      element.style.setProperty('--shell-astra-clearance', `${element.getBoundingClientRect().bottom - button.top + 16}px`)
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

it.each([320, 412, 1352].flatMap(width => (['light', 'dark'] as const).flatMap(mode => [1, 2].map(scale => ({ width, mode, scale })))))('clears create, tabs and back-to-top at $width in $mode with text scale $scale', async ({ width, mode, scale }) => {
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
      const page = document.querySelector('[data-shell-page]')!.getBoundingClientRect()
      return { width: button.width, height: button.height, left: button.left, right: button.right, top: button.top, bottom: button.bottom,
        createTop: create.top, createHeight: create.height, tabsTop: tabs.top, tabsHeight: tabs.height, pillBottom: top.bottom, pageBottom: page.bottom,
        composers: document.querySelectorAll('[data-composer-root]').length }
    })
    expect(geometry.width).toBe(60)
    expect(geometry.height).toBe(60)
    expect(geometry.composers).toBe(0)
    expect(geometry.left).toBeGreaterThanOrEqual(16)
    expect(geometry.right).toBeLessThanOrEqual(width - 16)
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.pillBottom)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.pageBottom)
    if (geometry.createHeight) expect(geometry.bottom + 24).toBeLessThanOrEqual(geometry.createTop)
    if (geometry.tabsHeight) expect(geometry.bottom).toBeLessThanOrEqual(geometry.tabsTop)
  } finally { await page.close() }
})
