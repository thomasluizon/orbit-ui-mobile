import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { AstraButton } from '@/components/shell/astra-button'
import { ShellWide } from '@/components/shell/shell-wide'
import { Fab } from '@/components/ui/fab'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
let launch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async next => { launch = next; browser = await next })
beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterAll(async () => { await closeChrome(launch) }, 30_000)

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
