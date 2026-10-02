import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { execFileSync } from 'node:child_process'
import { NextIntlClientProvider } from 'next-intl'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { useTranslations } from 'next-intl'
import { AppSelect } from '@/components/ui/app-select'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { CalendarHeader, CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { HabitDrill } from '@/components/habits/habit-list/habit-drill'
import { Chip } from '@/components/ui/chip'
import { Sheet } from '@/components/ui/sheet'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { fireEvent, render, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

function ReminderTargets() {
  const t = useTranslations()
  return <>
    <ReminderSection reminderEnabled reminderTimes={[15]} onReminderTimesChange={() => {}} onToggleReminder={() => {}} reminderLabel={String} t={t} />
    <HabitChecklist items={[{ text: 'Beber água', isChecked: false }]} editable onItemsChange={() => {}} />
  </>
}

describe('painted press and hover shapes', () => {
  it('renders the compact layout inventory from real controls and providers', () => {
    const container = document.createElement('section')
    container.innerHTML = execFileSync(process.execPath, ['--import', 'tsx', resolve('e2e/layout/compact-target-inventory.tsx')], {
      encoding: 'utf8',
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve('e2e/layout/compact-target-tsconfig.json') },
    })
    expect(within(container).getByRole('button', { name: /Sequência/ })).toBeDefined()
    for (const label of [ptBr.habits.form.resetChecklist, ptBr.habits.form.clearChecklist]) {
      expect(within(container).getByRole('button', { name: label })).toBeDefined()
    }
  })

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

  it.each([412, 1280])('paints the custom reminder commit as a full round target at %spx', async (width) => {
    const controls = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr} timeZone="UTC"><ReminderTargets /></NextIntlClientProvider>)
    fireEvent.click(within(controls.container).getByRole('button', { name: ptBr.habits.form.reminderAdd }))
    fireEvent.click(within(controls.container).getByRole('button', { name: ptBr.habits.form.reminderCustom }))
    const markup = controls.container.innerHTML
    controls.unmount()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = resolveWebThemeVariables('orange', 'dark')
      const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root {${declarations}} button {transition:none !important}</style>${markup}`)
      await loadAppFonts(page)
      const customReminder = page.getByPlaceholder(ptBr.habits.form.reminderCustomPlaceholder).locator('..')
      const button = customReminder.getByRole('button', { name: ptBr.common.add, exact: true })
      await button.hover()
      const geometry = await button.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { width: bounds.width, height: bounds.height, radius: style.borderTopLeftRadius, background: style.backgroundColor }
      })
      expect(geometry.width).toBeGreaterThanOrEqual(44)
      expect(geometry.height).toBeGreaterThanOrEqual(44)
      expect(Math.min(Number.parseFloat(geometry.radius), geometry.width / 2, geometry.height / 2), geometry.radius).toBe(22)
      expect(geometry.background).toBe('rgb(183, 78, 18)')
    } finally { await page.close() }
  })

  it.each([{ mode: 'dark', hasTouch: false }, { mode: 'light', hasTouch: false }, { mode: 'dark', hasTouch: true }, { mode: 'light', hasTouch: true }] as const)('paints the neutral role in $mode mode with touch: $hasTouch', async ({ mode, hasTouch }) => {
    const noop = () => {}
    const drill: React.ComponentProps<typeof HabitDrill>['drill'] = {
      drillStack: ['parent'], currentParentId: null, currentParent: null, drillChildren: [],
      hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
      drillLoading: false, drillError: '', drillInto: async () => {}, drillBack: noop,
      drillReset: noop, refreshCurrent: async () => {}, getDrillChildren: () => [],
    }
    const controls = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr} timeZone="UTC">
      <CalendarHeader monthLabel="April" year={2026} previousMonthLabel="Previous month" nextMonthLabel="Next month" currentMonthLabel="Current month" selectYearLabel="Select year" onPreviousMonth={noop} onNextMonth={noop} onCurrentMonth={noop} onSelectYear={noop} />
      <CalendarWeekNav weekLabel="Week" previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={noop} onNextWeek={noop} onCurrentWeek={noop} />
      <TodayDateControl dayName="Wednesday" numericDate="08/04/2026" isTodaySelected={false} nextDisabled={false}
        previousLabel="Previous day" todayLabel="Today" goToTodayLabel="Go to Today" nextLabel="Next day"
        moreLabel="List options" selectLabel="Select" collapseLabel="Collapse" allCollapsed={false}
        refreshLabel="Refresh" completedLabel="Completed" showCompleted={false} isFetching={false}
        onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
        onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} searchLabel="Search" onSearch={noop} />
      <HabitDrill drill={drill} t={(key) => key} hasProAccess renderHabitCard={() => null} onAddSubHabit={noop} />
      <Chip ariaLabel="Idle chip">Idle</Chip><Chip active ariaLabel="Selected chip">Selected</Chip>
      <SegmentedControl label="Views" options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }]} value="all" onChange={noop} />
      <AppSelect value="before" options={[{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }]} label="Direction" onChange={noop} />
      <TagEditorRow value="Health" inputAriaLabel="Tag" actionLabel="Save" cancelAriaLabel="Cancel" disabled={false} onChange={noop} onCommit={noop} onCancel={noop} />
    </NextIntlClientProvider>)
    const markup = controls.container.innerHTML
    controls.unmount()
    const sheet = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr} timeZone="UTC"><Sheet title="Options" onClose={noop}>Options</Sheet></NextIntlClientProvider>)
    const close = document.querySelector(`button[aria-label="${ptBr.common.close}"]`)!.outerHTML
    sheet.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce', hasTouch })
    try {
      const variables = resolveWebThemeVariables('orange', mode)
      const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root {${declarations}} body {padding:48px} :is(button, select) {transition:none !important}</style>${markup}${close}`)
      await loadAppFonts(page)
      const expectedFill = await page.evaluate((fill) => { const probe = document.createElement('span'); probe.style.backgroundColor = fill; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color }, variables['--bg-hover']!)
      for (const label of ['Previous day', 'Next day', 'List options', 'Search', 'Previous month', 'Next month', 'Current month', 'Select year', 'Previous week', 'Next week', 'Current week', 'common.back', 'Idle chip', 'Selected chip', ptBr.common.close, 'Cancel']) {
        const control = page.getByRole('button', { name: label, exact: true })
        const bounds = await control.boundingBox()
        expect(bounds!.width, `${label} target width`).toBeGreaterThanOrEqual(44)
        expect(bounds!.height, `${label} target height`).toBeGreaterThanOrEqual(44)
        await control.hover()
        if (!hasTouch) expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor), label).toBe(expectedFill)
        await page.mouse.down()
        expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor), `${label} press`).toBe(expectedFill)
        await page.mouse.up()
      }
      if (!hasTouch) {
        const direction = page.getByRole('combobox', { name: 'Direction' })
        await direction.hover()
        expect(await direction.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
      }
      const segment = page.getByRole('radio', { name: 'Active', exact: true })
      await segment.hover()
      await page.mouse.down()
      expect(await segment.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
      await page.mouse.up()
      const save = page.getByRole('button', { name: 'Save', exact: true })
      const saveBounds = await save.boundingBox()
      expect(saveBounds!.width).toBeGreaterThanOrEqual(44)
      expect(saveBounds!.height).toBeGreaterThanOrEqual(44)
      await save.hover()
      if (!hasTouch) expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(183, 78, 18)')
      await page.mouse.down()
      expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(162, 71, 22)')
      await page.mouse.up()
    } finally { await page.close() }
  })
})
