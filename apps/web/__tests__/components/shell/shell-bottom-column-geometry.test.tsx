import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import { Composer } from '@/components/shell/composer'
import { ShellWide } from '@/components/shell/shell-wide'
import { Toast } from '@/components/ui/toast'
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
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

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
      fab={<button type="button" style={{ width: 48, height: 48 }}>Create</button>}>
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
        return {
          reference: right('[data-column-reference]'),
          pill: right('[data-shell-pinned-slot] [data-composer-input-row]'),
          note: document.querySelector('[data-shell-pinned-slot] [data-composer-root] p')?.getBoundingClientRect().right,
          notice: right('[data-shell-notice] [data-kind]'),
          fab: { right: fab.right, top: fab.top, bottom: fab.bottom,
            hit: document.elementFromPoint(fab.x + fab.width / 2, fab.y + fab.height / 2)?.closest('button')?.textContent },
          bottomTop: document.querySelector('[data-shell-bottom]')!.getBoundingClientRect().top,
          tabs: { left: tabs.left, right: tabs.right },
          column: { left: column.left, right: column.right },
        }
      })
      expect.soft(Math.abs(geometry.pill - geometry.reference), 'composer pill').toBeLessThanOrEqual(0.5)
      expect.soft(Math.abs(geometry.notice - geometry.reference), 'shell notice').toBeLessThanOrEqual(0.5)
      if (state !== 'idle') expect.soft(Math.abs(geometry.note! - geometry.reference), 'composer note').toBeLessThanOrEqual(0.5)
      if (width < 1024) {
        expect.soft(Math.abs(geometry.fab.right - geometry.reference), 'create target').toBeLessThanOrEqual(0.5)
        expect(geometry.fab.bottom).toBeLessThanOrEqual(geometry.bottomTop - 16)
        expect(geometry.fab.hit).toBe('Create')
        expect(geometry.tabs).toEqual(geometry.column)
      }
    } finally { await page.close(); view.unmount() }
  })
})
