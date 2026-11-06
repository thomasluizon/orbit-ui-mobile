import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import { SPACING } from '@orbit/shared/theme'
import { ShellWide } from '@/components/shell/shell-wide'
import { Toast } from '@/components/ui/toast'
import { Fab } from '@/components/ui/fab'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const SHARED_GAP = SPACING.s24

describe('Shell notice clearance geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each((['light', 'dark'] as const).flatMap(mode => [false, true].map(today => ({ mode, today }))))('ends the toast the shared gap above the tab bar in $mode (Hoje: $today)', async ({ mode, today }) => {
    const view = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId={today ? 'hoje' : 'perfil'} navLabel={en.nav.mainNavigation}
      header={<div style={{ height: 56 }} />}
      notice={<Toast kind="neutral" message="O aviso saiu da lista." actionLabel="Desfazer" onAction={vi.fn()} />}
      tabBar={<nav style={{ height: 80 }}>Tabs</nav>}
      fab={today ? <Fab label="Create" onClick={vi.fn()}><span aria-hidden="true">+</span></Fab> : undefined}>
      <div style={{ height: 240 }}>Content</div>
    </ShellWide>)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 412, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
        return {
          toast: box('[data-shell-notice] [data-kind]')!.toJSON() as DOMRect,
          tabs: box('[data-shell-tab-bar]')!.toJSON() as DOMRect,
          fab: box('[data-shell-fab] button')?.toJSON() as DOMRect | undefined,
        }
      })
      expect(geometry.tabs.top - geometry.toast.bottom, JSON.stringify(geometry)).toBeGreaterThanOrEqual(SHARED_GAP - 0.5)
      if (today) expect(geometry.toast.top - geometry.fab!.bottom, JSON.stringify(geometry)).toBeGreaterThanOrEqual(SHARED_GAP - 0.5)
    } finally { await page.close(); view.unmount() }
  })
})
