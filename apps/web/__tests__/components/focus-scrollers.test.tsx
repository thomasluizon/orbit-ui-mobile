import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enUS } from 'date-fns/locale'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { goalKeys } from '@orbit/shared/query'
import { calendarDayEntrySchema } from '@orbit/shared/types/calendar'
import { CalendarTimeGrid } from '@/components/calendar/calendar-time-grid'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'
import { TimeField } from '@/components/ui/time-field'
import { YearPicker } from '@/components/ui/year-picker'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { revealFocusedControl } from '@/lib/focus-scroll'
import { inspectFocusedRing, readOutlineVisibility } from '@/e2e/layout/focus-indicators'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true } }) }))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => <section>{children}{actions}</section>,
  useSheetHost: () => ({ sheetRef: null, closeSheet: vi.fn() }),
}))

const cases = [412, 1352].flatMap((width) => ['dark', 'light'].map((mode) => ({ width, mode: mode as 'dark' | 'light' })))

function mountSurface(surface: string) {
  if (surface === 'years') return render(<YearPicker selectedYear={2025} onSelectYear={vi.fn()} />)
  if (surface === 'checklist') return render(<HabitChecklist items={[{ text: 'First', isChecked: false }, { text: 'Last', isChecked: true }]} interactive onToggle={vi.fn()} />)
  if (surface === 'emoji categories') {
    const rendered = render(<HabitEmojiSelector selectedEmoji="" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    return rendered
  }
  if (surface.startsWith('time options')) {
    const rendered = render(<TimeField label="Time" value={surface === 'time options' ? '00:00' : '23:55'} hourCycle={surface === 'time options 12-hour' ? 'h12' : 'h23'} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Time: common.selectTime' }))
    return rendered
  }
  if (surface === 'tag picker') {
    const tags = Array.from({ length: 21 }, (_, index) => ({ ...makeHabitScheduleItem().tags[0]!, id: `tag-${index}`, name: `Tag ${index}` }))
    const rendered = render(<TagPickerField tags={tags} selectedIds={[]} atLimit={false} disabled={false}
      onToggle={vi.fn()} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} editLabel="Edit" deleteLabel="Delete" />)
    fireEvent.click(screen.getByRole('button', { name: /habits.form.tags/ }))
    return rendered
  }
  if (surface === 'goal picker') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    queryClient.setQueryData(goalKeys.lists(), Array.from({ length: 21 }, (_, index) => createMockGoal({ id: `goal-${index}`, title: `Goal ${index}` })))
    const rendered = render(<QueryClientProvider client={queryClient}><GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: /habits.form.goals/ }))
    return rendered
  }
  const entries = Array.from({ length: 8 }, (_, index) => calendarDayEntrySchema.parse({
    habitId: `calendar-habit-${index}`, title: `Habit ${index}`, status: 'upcoming', isBadHabit: false, isOneTime: false,
    dueTime: index < 6 ? null : index === 6 ? '00:00' : '23:00',
  }))
  return render(<CalendarTimeGrid columns={[{ date: new Date('2025-01-06T12:00:00Z'), dateStr: '2025-01-06', isToday: false, isFuture: false }]}
    dayMap={new Map([['2025-01-06', entries]])} onSelectDay={vi.fn()} displayTime={(time) => time} dateFnsLocale={enUS} allDayLabel="Any time" nowLabel="Now" timeZone="UTC" />)
}

const surfaces = [
  { surface: 'years', selector: '.thin-scrollbar button' },
  { surface: 'checklist', selector: '[role="checkbox"]' },
  { surface: 'emoji categories', selector: '[aria-label="habits.form.emojiCategories"] button' },
  { surface: 'time options', selector: '[role="radio"][tabindex="0"]' },
  { surface: 'time options end', selector: '[role="radio"][tabindex="0"]' },
  { surface: 'time options 12-hour', selector: '[role="radio"][tabindex="0"]' },
  { surface: 'tag picker', selector: '[data-focus-inset] button' },
  { surface: 'goal picker', selector: 'button[aria-pressed]' },
  { surface: 'calendar controls', selector: '[data-testid="calendar-time-grid"] button' },
]

describe('other clipped control containers in Chromium', () => {
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

  for (const { surface, selector } of surfaces) {
    it.each(cases)(`${surface} has complete perimeters at $width in $mode`, async ({ width, mode }) => {
      const { container, unmount } = mountSurface(surface)
      if (surface !== 'checklist' && surface !== 'calendar controls') {
        const control = container.querySelector(selector)!
        const scrolling = vi.spyOn(control, 'scrollIntoView')
        scrolling.mockClear()
        fireEvent.focus(control)
        expect(scrolling).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
        scrolling.mockRestore()
      }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([property, value]) => `${property}: ${value};`).join(' ')
        await page.setContent(`<style>${stylesheet}:root {${variables}}body {padding:16px}</style><button>Before</button>${container.innerHTML}<button>After</button>`)
        await page.addScriptTag({ content: `document.querySelectorAll('[data-focus-inset=""]').forEach((scroller) => scroller.addEventListener('focus', ${revealFocusedControl.toString()}, true));` })
        const controls = page.locator(selector)
        expect(await controls.count()).toBeGreaterThan(0)
        const count = await controls.count()
        for (let index = 0; index < count; index += 1) {
          const control = controls.nth(index)
          await control.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          const geometry = await control.evaluate((element) => ({ label: element.textContent, bounds: element.getBoundingClientRect().toJSON(), parent: element.parentElement!.getBoundingClientRect().toJSON() }))
          expect(await readOutlineVisibility(control), JSON.stringify({ index, geometry })).toMatchObject({ visible: true, clippedBy: [] })
        }
        if (surface === 'tag picker' || surface === 'goal picker') {
          const firstControl = container.querySelector('button[aria-pressed]')!
          const scroller = surface === 'tag picker' ? firstControl.parentElement!.parentElement! : firstControl.parentElement!
          fireEvent.scroll(scroller, { target: { scrollTop: 688 } })
          expect(container.textContent).toContain(surface === 'tag picker' ? 'Tag 20' : 'Goal 20')
          await page.setContent(`<style>${stylesheet}:root {${variables}}body {padding:16px}</style><button>Before</button>${container.innerHTML}<button>After</button>`)
          await page.addScriptTag({ content: `document.querySelectorAll('[data-focus-inset=""]').forEach((scroller) => scroller.addEventListener('focus', ${revealFocusedControl.toString()}, true));` })
          const finalControls = page.locator(selector)
          for (let index = 0; index < await finalControls.count(); index += 1) {
            const control = finalControls.nth(index)
            await control.focus()
            await page.keyboard.press('Shift+Tab')
            await page.keyboard.press('Tab')
            expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
            expect(await readOutlineVisibility(control)).toMatchObject({ visible: true, clippedBy: [] })
          }
        }
      } finally { await page.close(); unmount() }
    })
  }
})
