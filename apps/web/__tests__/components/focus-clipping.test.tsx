import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import type { ComposerSuggestion, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { HabitRow } from '@/components/habits/habit-row'
import { SortableHabitItem } from '@/components/habits/habit-list/sortable-habit-item'
import { Composer } from '@/components/shell/composer'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { RowList } from '@/components/ui/row-list'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectFocusedRing, readOutlineVisibility } from '@/e2e/layout/focus-indicators'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const cases = [412, 1352].flatMap((width) => ['dark', 'light'].map((mode) => ({ width, mode: mode as 'dark' | 'light' })))

function suggestion(label: string): ComposerSuggestion {
  return { id: label, label, onSelect: vi.fn() }
}

const suggestions: ComposerSuggestions = [suggestion('Create'), suggestion('Review'), suggestion('Plan'), suggestion('Reflect'), suggestion('Organize'), suggestion('Celebrate')]

describe('clipped focus perimeters in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('shows every composer chip perimeter at $width in $mode', async ({ width, mode }) => {
    const { container } = render(<Composer
      state="idle" value="" words={en.shell.composer}
      suggestions={suggestions}
      onChangeValue={vi.fn()} onSend={vi.fn()}
    />)
    const firstChip = container.querySelector('[data-focus-inset] button')!
    const scrolling = vi.spyOn(firstChip, 'scrollIntoView')
    scrolling.mockClear()
    fireEvent.focus(firstChip)
    expect(scrolling).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    scrolling.mockRestore()
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([property, value]) => `${property}: ${value};`).join(' ')
      await page.setContent(`<style>${stylesheet}:root {${variables}}</style><button>Before</button>${container.innerHTML}<button>After</button>`)
      for (const forcedColors of ['none', 'active'] as const) {
        await page.emulateMedia({ forcedColors })
        for (let index = 0; index < 6; index += 1) {
          const chip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel }).getByRole('button').nth(index)
          await chip.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
          expect(await chip.evaluate((element) => element === document.activeElement), `chip ${index} ${forcedColors}`).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          expect(await readOutlineVisibility(chip)).toMatchObject({ visible: true, clippedBy: [] })
          expect(await chip.evaluate((element) => element.getBoundingClientRect().height)).toBe(44)
        }
      }
    } finally { await page.close() }
  })

  it.each(cases)('shows sortable handles and panel rows at $width in $mode', async ({ width, mode }) => {
    const habit = createMockHabit({ id: 'focus-habit', title: 'Read' })
    const { container } = render(<>
      <DndContext><SortableContext items={[habit.id]}><div className="habit-panel">
        <SortableHabitItem id={habit.id}><HabitRow habit={habit} actions={{ onDetail: vi.fn(), onLog: vi.fn() }} /></SortableHabitItem>
      </div></SortableContext></DndContext>
      <SettingsGroup items={[{ label: 'First', onClick: vi.fn() }, { label: 'Last', onClick: vi.fn() }]} />
      <RowList><SettingsRow label="Settings" onClick={vi.fn()} /></RowList>
      <RowList><SettingsRow label="Switches"><Switch label="On" checked onChange={vi.fn()} /><Switch label="Off" checked={false} onChange={vi.fn()} /></SettingsRow></RowList>
    </>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([property, value]) => `${property}: ${value};`).join(' ')
      await page.setContent(`<style>${stylesheet}:root {${variables}}body {padding:16px}</style><button>Before</button><main>${container.innerHTML}</main><button>After</button>`)
      const controls = page.locator('main [tabindex="0"], main button:not([disabled])')
      for (const forcedColors of ['none', 'active'] as const) {
        await page.emulateMedia({ forcedColors })
        for (let index = 0; index < await controls.count(); index += 1) {
          const control = controls.nth(index)
          await control.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          expect(await readOutlineVisibility(control), `control ${index}: ${await control.evaluate((element) => element.outerHTML)}`).toMatchObject({ visible: true, clippedBy: [] })
        }
      }
    } finally { await page.close() }
  })
})
