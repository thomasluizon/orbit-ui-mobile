import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { CalendarHeader, CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { HabitDrill } from '@/components/habits/habit-list/habit-drill'
import { Chip } from '@/components/ui/chip'
import { Sheet } from '@/components/ui/sheet'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { HabitTagChip } from '@/components/habits/habit-form-fields/habit-tag-chip'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { DayCell } from '@/components/dates/day-cell'

const cellWords: DayCellWords = {
  none: 'none',
  partial: 'partial',
  full: 'full',
  notScheduled: 'not scheduled',
  of: 'of',
  today: 'today',
  readOnly: 'read only',
}

describe('painted press and hover shapes', () => {
  it('layers the day hover fill over the whole round hit area without hiding the outcome', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} loggable onPress={() => {}} />,
    )

    const hitArea = container.querySelector('button')
    expect(hitArea?.className).toContain('rounded-full')
    expect(hitArea?.className).toContain('overflow-hidden')

    const pressFill = hitArea?.querySelector('[data-press-fill]')
    expect(pressFill?.className).toContain('absolute inset-0')
    expect(pressFill?.className).toContain('rounded-full')
    expect(pressFill?.className).toContain('bg-[var(--bg-hover)]')
    expect(pressFill?.className).toContain('group-hover:opacity-100')
    expect(pressFill?.className).toContain('pointer-events-none')
    expect(pressFill).toHaveAttribute('aria-hidden', 'true')
    expect(hitArea?.lastElementChild).toBe(pressFill)
    expect(container.querySelector('[data-outcome="full"] span')).toHaveStyle({ background: 'var(--fg-1)' })
  })

  it('gives a read-only day no press fill', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} />,
    )

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[data-press-fill]')).toBeNull()
    expect(container.querySelector('[data-outcome="full"] span')).toHaveStyle({ background: 'var(--fg-1)' })
  })
})

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('interaction fill parity in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([{ mode: 'dark', hasTouch: false }, { mode: 'light', hasTouch: false }, { mode: 'dark', hasTouch: true }, { mode: 'light', hasTouch: true }] as const)('paints the neutral role in $mode mode with touch: $hasTouch', async ({ mode, hasTouch }) => {
    const noop = () => {}
    const drill: React.ComponentProps<typeof HabitDrill>['drill'] = {
      drillStack: ['parent'], currentParentId: null, currentParent: null, drillChildren: [],
      hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
      drillLoading: false, drillError: '', drillInto: async () => {}, drillBack: noop,
      drillReset: noop, refreshCurrent: async () => {}, getDrillChildren: () => [],
    }
    const controls = render(<>
      <CalendarHeader monthLabel="April" year={2026} previousMonthLabel="Previous month" nextMonthLabel="Next month" currentMonthLabel="Current month" selectYearLabel="Select year" onPreviousMonth={noop} onNextMonth={noop} onCurrentMonth={noop} onSelectYear={noop} />
      <CalendarWeekNav weekLabel="Week" previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={noop} onNextWeek={noop} onCurrentWeek={noop} />
      <HabitDrill drill={drill} t={(key) => key} hasProAccess renderHabitCard={() => null} onAddSubHabit={noop} />
      <Chip ariaLabel="Idle chip">Idle</Chip><Chip active ariaLabel="Selected chip">Selected</Chip>
      <SegmentedControl label="Views" options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }]} value="all" onChange={noop} />
      <TagEditorRow value="Health" inputAriaLabel="Tag" actionLabel="Save" cancelAriaLabel="Cancel" disabled={false} onChange={noop} onCommit={noop} onCancel={noop} />
      <HabitTagChip tag={{ id: 'health', name: 'Health' }} selected={false} animationClassName="" atLimit={false} disabled={false} onToggle={noop} onEdit={noop} onDelete={noop} editAriaLabel="Edit Health" deleteAriaLabel="Delete Health" />
    </>)
    const markup = controls.container.innerHTML
    controls.unmount()
    const sheet = render(<Sheet title="Options" onClose={noop}>Options</Sheet>)
    const close = document.querySelector('button[aria-label="common.close"]')!.outerHTML
    sheet.unmount()
    const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch })
    try {
      const variables = resolveWebThemeVariables('orange', mode)
      const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root {${declarations}} body {padding:48px} button {transition:none !important}</style>${markup}${close}`)
      const expectedFill = await page.evaluate((fill) => { const probe = document.createElement('span'); probe.style.backgroundColor = fill; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color }, variables['--bg-hover']!)
      for (const label of ['Previous month', 'Next month', 'Current month', 'Select year', 'Previous week', 'Next week', 'Current week', 'common.back', 'Idle chip', 'Selected chip', 'common.close', 'Cancel', 'Health', 'Edit Health', 'Delete Health']) {
        const control = page.getByRole('button', { name: label, exact: true })
        await control.hover()
        if (!hasTouch) expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor), label).toBe(expectedFill)
        await page.mouse.down()
        expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor), `${label} press`).toBe(expectedFill)
        await page.mouse.up()
      }
      const segment = page.getByRole('radio', { name: 'Active', exact: true })
      await segment.hover()
      await page.mouse.down()
      expect(await segment.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
      await page.mouse.up()
      const save = page.getByRole('button', { name: 'Save', exact: true })
      await save.hover()
      if (!hasTouch) expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(183, 78, 18)')
      await page.mouse.down()
      expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(162, 71, 22)')
      await page.mouse.up()
    } finally { await page.close() }
  })
})
