import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { execFileSync } from 'node:child_process'
import { NextIntlClientProvider } from 'next-intl'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { useTranslations } from 'next-intl'
import { AppSelect } from '@/components/ui/app-select'
import { readFileSync, readdirSync } from 'node:fs'
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

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }),
}))


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

  it('layers the day hover fill inside its circle without hiding the outcome', () => {
    const { container } = render(
      <DayCell size={44} day={15} label="March 15" words={cellWords} done={1} scheduled={1} loggable onPress={() => {}} />,
    )

    const hitArea = container.querySelector('button')
    expect(hitArea?.className).toContain('orbit-day-target')
    const circle = hitArea?.querySelector('[data-day-circle]')
    expect(circle).toHaveStyle({ maxWidth: '44px', borderRadius: '22px' })

    const pressFill = hitArea?.querySelector('[data-press-fill]')
    expect(pressFill?.className).toContain('absolute inset-0')
    expect(pressFill?.className).toContain('rounded-full')
    expect(pressFill?.className).toContain('bg-[var(--bg-hover)]')
    expect(pressFill?.className).toContain('opacity-0')
    expect(pressFill?.className).toContain('pointer-events-none')
    expect(pressFill).toHaveAttribute('aria-hidden', 'true')
    expect(circle?.firstElementChild).toBe(pressFill)
    expect(hitArea?.querySelectorAll('[data-press-fill]')).toHaveLength(2)
    expect(pressFill?.nextElementSibling?.firstElementChild).toHaveAttribute('data-press-fill')
    expect(pressFill?.nextElementSibling).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-day-disc]')).toHaveStyle({ background: 'var(--fg-1)' })
  })

  it('keeps read-only day fills hidden without an interactive target', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} />,
    )

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.orbit-day-target')).toBeNull()
    for (const fill of container.querySelectorAll('[data-press-fill]')) expect(fill.className).toContain('opacity-0')
    expect(container.querySelector('[data-day-disc]')).toHaveStyle({ background: 'var(--fg-1)' })
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

  it('bounds day hover paint and keeps read-only fills invisible under a hovered group', async () => {
    const controls = render(<div style={{ width: 97 }}>
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} loggable onPress={() => {}} />
      <div className="group" data-testid="readonly"><DayCell day={16} label="March 16" words={cellWords} done={1} scheduled={1} /></div>
    </div>)
    const markup = controls.container.innerHTML
    controls.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = resolveWebThemeVariables('orange', 'dark')
      const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>:root{${declarations}}${stylesheet}</style>${markup}`)
      const button = page.getByRole('button', { name: /March 15/ })
      expect((await button.boundingBox())!.width).toBeCloseTo(97, 1)
      await button.hover()
      const fills = button.locator('[data-press-fill]')
      await expect.poll(() => fills.first().evaluate((fill) => getComputedStyle(fill).opacity)).toBe('1')
      for (const [index, diameter] of [44, 34].entries()) {
        const bounds = await fills.nth(index).boundingBox()
        expect(bounds!.width).toBeCloseTo(diameter, 1)
        expect(bounds!.height).toBeCloseTo(diameter, 1)
      }
      const readonly = page.getByTestId('readonly')
      await readonly.hover()
      expect(await readonly.locator('[data-press-fill]').evaluateAll((fills) => fills.map((fill) => getComputedStyle(fill).opacity))).toEqual(['0', '0'])
    } finally { await page.close() }
  })

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
      const customReminder = page.getByRole('spinbutton', { name: ptBr.habits.form.reminderCustomLabel }).locator('..').locator('..')
      const button = customReminder.getByRole('button', { name: ptBr.common.add, exact: true })
      await button.hover()
      const geometry = await button.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { width: bounds.width, height: bounds.height, radius: style.borderTopLeftRadius, background: style.backgroundColor }
      })
      expect(geometry.width).toBeGreaterThanOrEqual(48)
      expect(geometry.height).toBeGreaterThanOrEqual(48)
      expect(Math.min(Number.parseFloat(geometry.radius), geometry.width / 2, geometry.height / 2), geometry.radius).toBe(24)
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
      <CalendarHeader currentMonth={new Date(2026, 3, 1)} todayKey="2026-04-08" previousMonthLabel="Previous month" nextMonthLabel="Next month" onPreviousMonth={noop} onNextMonth={noop} onCurrentMonth={noop} onSelectMonth={noop} />
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
      for (const label of ['Previous day', 'Next day', 'List options', 'Search', 'Previous month', 'Next month', `Abril, ${ptBr.calendar.monthPicker}`, 'Previous week', 'Next week', 'Week, Current week', ptBr.notifications.bell, 'common.back', 'Idle chip', 'Selected chip', ptBr.common.close, 'Cancel']) {
        const control = page.getByRole('button', { name: label, exact: true })
        const bounds = await control.boundingBox()
        expect(bounds!.width, `${label} target width`).toBeGreaterThanOrEqual(48)
        expect(bounds!.height, `${label} target height`).toBeGreaterThanOrEqual(48)
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
      expect(saveBounds!.width).toBeGreaterThanOrEqual(48)
      expect(saveBounds!.height).toBeGreaterThanOrEqual(48)
      await save.hover()
      if (!hasTouch) expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(183, 78, 18)')
      await page.mouse.down()
      expect(await save.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(162, 71, 22)')
      await page.mouse.up()
    } finally { await page.close() }
  })
})

function dimmingClasses(contents: string): string[] {
  return [...contents.matchAll(/[\w:[\]&()/.-]*(?:hover|active)[\w:[\]&()/.-]*:opacity-(\d+(?:\.\d+)?|\[[\d.]+\])/g)]
    .filter(([className, value]) => !className.replaceAll('not-disabled', 'enabled').replaceAll('not(:disabled)', 'enabled').includes('disabled') && (value!.startsWith('[') ? Number(value!.slice(1, -1)) < 1 : Number(value) < 100))
    .map(([className]) => className)
}

function controlSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? controlSources(path) : /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('enabled web control feedback', () => {
  it.each(['hover:opacity-80', 'enabled:active:opacity-85', 'group-hover:opacity-80', 'group-active:opacity-70', 'md:[&_button:enabled:active]:opacity-85', 'hover:opacity-[0.8]', 'not-disabled:hover:opacity-80', '[&:not(:disabled):' + 'hover]:opacity-80'])('rejects content dimming in %s', (className) => {
    expect(dimmingClasses(className)).toEqual([className])
  })

  it('retains disabled dimming and a separate fill reveal', () => {
    expect(dimmingClasses('disabled:opacity-40 disabled:hover:opacity-40 opacity-0 group-hover:opacity-100 group-active:opacity-100')).toEqual([])
  })

  it('keeps every enabled hover and press free of content dimming', () => {
    const failures = ['app', 'components'].flatMap((directory) => controlSources(resolve(directory)))
      .flatMap((path) => dimmingClasses(readFileSync(path, 'utf8')).map((className) => `${path}: ${className}`))
    expect(failures).toEqual([])
    const failuresInCss: string[] = []
    postcss.parse(readFileSync(resolve('app/globals.css'), 'utf8')).walkRules((rule) => {
      if (!/:(hover|active)\b/.test(rule.selector) || /:disabled/.test(rule.selector.replaceAll(':not(:disabled)', ':enabled'))) return
      rule.walkDecls('opacity', (declaration) => { if (Number(declaration.value) < 1) failuresInCss.push(`${rule.selector}: ${declaration.value}`) })
    })
    expect(failuresInCss).toEqual([])
  })
})
