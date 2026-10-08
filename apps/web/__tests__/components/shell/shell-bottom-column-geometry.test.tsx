import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import { Composer } from '@/components/shell/composer'
import { ShellWide } from '@/components/shell/shell-wide'
import { Toast } from '@/components/ui/toast'
import { Fab } from '@/components/ui/fab'
import { Button } from '@/components/ui/pill-button'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { measureChromePaint } from '@/e2e/layout/composer-column-paint'
import { measureScrollbarGutter } from '@/e2e/layout/scrollbar-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Shell bottom column geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch }, {
    ignoreDefaultArgs: ['--hide-scrollbars'],
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet += `:root{${theme}}`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 1280])('preserves notice shadow paint and pointer access at %ipx', async (width) => {
    const view = render(<ShellWide items={[]} activeId="hoje" navLabel={en.nav.mainNavigation}
      composer={<Composer state="idle" value="" suggestions={[]} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />}
      notice={<><UpdateAvailableBanner /><Toast kind="neutral" message="Habit saved" actionLabel="Undo" onAction={vi.fn()} /></>}
      tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div style={{ height: 1600 }}>Habits</div>
    </ShellWide>)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const paint = await page.locator('[data-shell-notice] [data-kind]').evaluate(measureChromePaint)
      expect(paint.extent.top).toBeGreaterThan(0)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect.soft(paint.clearance[side], `${side} shadow clearance`).toBeGreaterThanOrEqual(paint.extent[side] - 0.5)
      }
      expect.soft(paint.clipPointerEvents).toBe('none')
      await page.getByRole('button', { name: 'Undo' }).click()
      const paddingHit = await page.locator('[data-shell-notice]').evaluate((clip) => {
        const bounds = clip.getBoundingClientRect()
        return clip.contains(document.elementFromPoint(bounds.left + 8, bounds.top + 1))
      })
      expect(paddingHit).toBe(false)
      await page.locator('[data-shell-notice] [data-kind]').evaluate((toast) => toast.remove())
      expect(await page.locator('[data-shell-notice] [data-update-live-region]').count()).toBe(1)
      expect(await page.locator('[data-shell-notice]').evaluate((clip) => clip.getBoundingClientRect().height)).toBe(0)
    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 1280])('keeps a pinned flow action focus perimeter whole at %ipx', async (width) => {
    const view = render(<ShellWide nav={false} action={<div className="flex justify-end px-4">
      <Button size="md" onClick={vi.fn()}>Continue</Button>
    </div>}><div style={{ height: 1600 }}>Form</div></ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: 'Continue' }).focus()
      const paint = await page.getByRole('button', { name: 'Continue' }).evaluate(measureChromePaint)
      expect(paint.outlineWidth).toBeGreaterThan(0)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect.soft(paint.clearance[side], `${side} focus clearance`).toBeGreaterThanOrEqual(paint.extent[side] - 0.5)
      }
      expect(paint.hit).toBe(true)
    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 600, 840, 1100].flatMap((width) =>
    (['idle', 'atLimit', 'offline'] as const).map((state) => ({ width, state })),
  ))('aligns bottom chrome with content at $width in $state', async ({ width, state }) => {
    const composerStates = {
      idle: { state: 'idle' },
      atLimit: { state: 'atLimit', limitReason: en.shell.composer.limit.reason },
      offline: { state: 'offline', limitReason: en.shell.composer.offline.reason },
    } as const
    const view = render(<ShellWide items={[]} activeId="hoje" navLabel={en.nav.mainNavigation}
      composer={<Composer {...composerStates[state]}
        value="" suggestions={[]} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />}
      notice={<Toast kind="neutral" message="Habit saved" />}
      tabBar={<nav style={{ height: 80 }}>Tabs</nav>}
      fab={<Fab label="Create" onClick={vi.fn()}><span aria-hidden="true">+</span></Fab>}>
      <div className="px-4"><div data-column-reference="" style={{ height: 1600 }}>Habits</div></div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const gutter = await page.locator('[data-shell-scroller]').evaluate(measureScrollbarGutter)
      expect(gutter).toBeGreaterThan(0)
      const geometry = await page.evaluate(() => {
        const right = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().right
        const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
        const column = document.querySelector('[data-shell-column]')!.getBoundingClientRect()
        const fab = document.querySelector('[data-shell-fab] button')!.getBoundingClientRect()
        const fabClip = document.querySelector('[data-shell-fab-clip]')!.getBoundingClientRect()
        return {
          reference: right('[data-column-reference]'),
          pill: right('[data-shell-pinned-slot] [data-composer-input-row]'),
          note: document.querySelector('[data-shell-pinned-slot] [data-composer-root] p')?.getBoundingClientRect().right,
          notice: right('[data-shell-notice] [data-kind]'),
          fab: { right: fab.right, top: fab.top, bottom: fab.bottom,
            hit: document.elementFromPoint(fab.x + fab.width / 2, fab.y + fab.height / 2)?.closest('button')?.getAttribute('aria-label'),
            topClearance: fab.top - fabClip.top, bottomClearance: fabClip.bottom - fab.bottom },
          bottomTop: document.querySelector('[data-shell-bottom]')!.getBoundingClientRect().top,
          tabs: { left: tabs.left, right: tabs.right },
          column: { left: column.left, right: column.right },
        }
      })
      expect.soft(Math.abs(geometry.pill - geometry.reference), 'composer pill').toBeLessThanOrEqual(0.5)
      expect.soft(Math.abs(geometry.notice - geometry.reference), 'shell notice').toBeLessThanOrEqual(0.5)
      if (state !== 'idle') expect.soft(Math.abs(geometry.note! - geometry.reference), 'composer note').toBeLessThanOrEqual(0.5)
      if (width < 1024) {
        const fabPaint = await page.locator('[data-shell-fab] button').evaluate(measureChromePaint)
        expect(fabPaint.extent.top).toBeGreaterThan(0)
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          expect(fabPaint.clearance[side], `${side} FAB paint clearance`).toBeGreaterThanOrEqual(fabPaint.extent[side] - 0.5)
        }
        expect.soft(Math.abs(geometry.fab.right - geometry.reference), 'create target').toBeLessThanOrEqual(0.5)
        expect(geometry.fab.bottom).toBeLessThanOrEqual(geometry.bottomTop - 16)
        expect(geometry.fab.hit).toBe('Create')
        expect(geometry.fab.topClearance).toBeGreaterThanOrEqual(8)
        expect(geometry.fab.bottomClearance).toBeGreaterThanOrEqual(8)
        expect(geometry.tabs).toEqual(geometry.column)
      }
    } finally { await page.close(); view.unmount() }
  })
})
