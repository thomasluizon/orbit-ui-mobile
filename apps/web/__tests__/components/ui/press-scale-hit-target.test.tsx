import type { ReactElement } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { Locator, Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextIntlClientProvider } from 'next-intl'
import { Command } from 'cmdk'
import { enUS } from 'date-fns/locale'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { AnswerBlock } from '@/components/chat/answer-block'
import { CalendarTimeGrid } from '@/components/calendar/calendar-time-grid'
import { CommandRow } from '@/components/command/command-row'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { HabitRow } from '@/components/habits/habit-row'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { HabitRowTrailing } from '@/components/habits/habit-row-trailing'
import { SelectionTray } from '@/components/habits/selection-tray'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { Chip } from '@/components/ui/chip'
import { PillAnchor } from '@/components/ui/pill-anchor'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const schedule = { frequencyUnit: 'Week' as const, frequencyQuantity: 3, intervalWeeks: 2, days: [], isGeneral: false, isFlexible: true, dueTime: '' }

const parentRing = { hasChildren: true, childProgress: { done: 1, total: 3 }, state: 'empty', isDone: false, canLog: true, onMenuSelect: vi.fn(),
  actions: { onLog: vi.fn(), onUnlog: vi.fn() } as never, onToggleStatus: vi.fn(), completionReadOnly: false, completionStatusUnavailable: false } as const

const tray = { selectedCount: 1, allSelected: false, onSelectAll: vi.fn(), onDeselectAll: vi.fn(), onBulkLog: vi.fn(), onBulkSkip: vi.fn(),
  onBulkMove: vi.fn(), onBulkDelete: vi.fn(), onCancel: vi.fn() }

const gridColumn = { date: new Date(2025, 5, 16), dateStr: '2025-06-16', isToday: false, isFuture: false }

function timeGrid() {
  return <CalendarTimeGrid columns={[gridColumn]} dayMap={new Map([[gridColumn.dateStr, [{ habitId: '1', title: 'Meditate', status: 'upcoming', isBadHabit: false, dueTime: '08:00', isOneTime: false }]]])}
    onSelectDay={vi.fn()} displayTime={(time) => time} dateFnsLocale={enUS} allDayLabel="No set time" nowLabel="Now" isLoading={false} timeZone="UTC" />
}

function markupOf(node: ReactElement) {
  const { container, unmount } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{node}</NextIntlClientProvider>)
  const markup = container.innerHTML
  unmount()
  return markup
}

const controls: [string, () => ReactElement, (page: Page) => Locator][] = [
  ['the onboarding proposal card', () => <OnboardingCreateHabit title="Walk outside" emoji="🚶" schedule={schedule} proposed correcting={false} canSaveRepeatWeeks atLimit={false} allowance={5}
    onCorrect={vi.fn()} onToggleDay={vi.fn()} onTimeChange={vi.fn()} onModeChange={vi.fn()} onFrequencyUnitChange={vi.fn()} onQuantityChange={vi.fn()} onIntervalWeeksChange={vi.fn()} />,
  (page) => page.getByRole('button', { name: 'Correct schedule. Emoji proposed by Astra', exact: true })],
  ['QuietLink', () => <QuietLink onClick={vi.fn()}>Back</QuietLink>, (page) => page.getByRole('button', { name: 'Back', exact: true })],
  ['the pricing stay-free link', () => <PricingSection profile={null} plans={null} isLoadingPlans isPlansError={false} isOnline trialDaysLeft={null}
    checkoutLoading={null} checkoutError="" discountedAmount={(amount) => amount} onCheckout={vi.fn()} onStayFree={vi.fn()} onRetryPlans={vi.fn()}
    t={((key: string) => key) as never} />, (page) => page.getByRole('link', { name: 'upgrade.convert.stayFree', exact: true })],
  ['the selection tray select-all', () => <SelectionTray {...tray} />, (page) => page.getByRole('button', { name: en.common.selectAll, exact: true })],
  ['a calendar timed block', timeGrid, (page) => page.getByTestId('time-grid-event')],
  ['a calendar week header', timeGrid, (page) => page.getByTestId('time-grid-col-header')],
  ['the command row', () => <Command><Command.List><CommandRow leading={<span />} label="Morning run" value="morning-run" onSelect={vi.fn()} /></Command.List></Command>,
    (page) => page.locator('[cmdk-item]')],
  ['a pill button', () => <PillButton size="md" onClick={vi.fn()}>Continue to checkout</PillButton>, (page) => page.getByRole('button', { name: 'Continue to checkout', exact: true })],
  ['a ghost pill button', () => <PillButton size="md" variant="ghost" onClick={vi.fn()}>Continue to checkout</PillButton>, (page) => page.getByRole('button', { name: 'Continue to checkout', exact: true })],
  ['a pill anchor', () => <PillAnchor href="https://example.com/billing">Open the billing portal in your browser</PillAnchor>,
    (page) => page.getByRole('link', { name: 'Open the billing portal in your browser', exact: true })],
  ['a resting chip', () => <Chip onClick={vi.fn()}>Morning routine</Chip>, (page) => page.getByRole('button', { name: 'Morning routine', exact: true })],
  ['a selected chip', () => <Chip active onClick={vi.fn()}>Morning routine</Chip>, (page) => page.getByRole('button', { name: 'Morning routine', exact: true })],
  // WHY: these eight scale their whole 48px target. The scale removes 0.96px at each edge, which is under 1px, so a press at the exact edge keeps its click. Each case guards that band. https://github.com/thomasluizon/orbit-tickets/issues/2096
  ['the answer block habit check', () => <AnswerBlock definition={{ kind: 'pickList', block: pickListBlockFixture }} />,
    (page) => page.locator('[data-habit-row-control="check"]').first()],
  ['the habit row disclosure', () => <HabitRow habit={createMockHabit({ title: 'Read' })} structuralColumn hasChildren actions={{ onDetail: vi.fn(), onToggleExpand: vi.fn() }} />,
    (page) => page.locator('[data-habit-row-control="disclosure"]')],
  ['the habit row selection', () => <HabitRow habit={createMockHabit({ title: 'Read' })} structuralColumn selectMode actions={{ onDetail: vi.fn(), onToggleSelection: vi.fn() }} />,
    (page) => page.locator('[data-habit-row-control="selection"]')],
  ['the habit row check', () => <CheckCircle state="empty" onToggle={vi.fn()} disabled={false} ariaLabel="Log" />, (page) => page.getByRole('button', { name: 'Log', exact: true })],
  ['the habit row parent ring', () => <HabitRowTrailing habit={createMockHabit({ title: 'Parent' })} menuItems={[]} {...parentRing} />,
    (page) => page.locator('[data-habit-row-control="check"]')],
  ['the habit row menu', () => <HabitRowTrailing habit={createMockHabit({ title: 'Parent' })} menuItems={[{ id: 'edit', label: 'Edit' }]} {...parentRing} />,
    (page) => page.locator('[data-habit-row-control="menu"]')],
  ['a selection tray action', () => <SelectionTray {...tray} />, (page) => page.getByRole('button', { name: en.habits.bulkBar.log, exact: true })],
  ['the streak badge', () => <StreakBadge streak={3} />, (page) => page.locator('.orbit-streak-badge')],
]

describe('press hit target in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(controls)('keeps the click of a press that starts at the edge of %s', async (_name, control, locate) => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'no-preference' })
    try {
      await page.setContent(`<style>${stylesheet} body{padding:16px} *,*::before,*::after{transition:none !important}</style><main>${markupOf(control())}</main>`)
      // WHY: static markup never runs the tray's entrance animation, so the tray is set to its settled state. https://github.com/thomasluizon/orbit-tickets/issues/2096
      await page.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid="bulk-action-bar"]').forEach((bar) => { bar.style.transform = 'none'; bar.style.opacity = '1' }))
      const card = locate(page)
      await card.scrollIntoViewIfNeeded()
      await card.evaluate((element) => { element.addEventListener('click', (event) => { event.preventDefault(); element.dataset.clicks = String(Number(element.dataset.clicks ?? 0) + 1) }) })
      const box = (await card.boundingBox())!
      const edge = { x: box.x, y: box.y + box.height / 2 }
      expect(await card.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), edge), 'the press starts on the control').toBe(true)
      await page.mouse.move(edge.x, edge.y)
      await page.mouse.down()
      await page.evaluate(() => new Promise<void>((settle) => requestAnimationFrame(() => requestAnimationFrame(() => settle()))))
      const pressed = await card.evaluate((element, point) => ({
        scaled: [element, ...element.querySelectorAll('*')].some((node) => getComputedStyle(node).scale === '0.96'),
        underPointer: element.contains(document.elementFromPoint(point.x, point.y)),
      }), edge)
      await page.mouse.up()
      expect(pressed.scaled, 'the press scales the control').toBe(true)
      expect(pressed.underPointer, 'the press target stays under the pointer while the control is scaled').toBe(true)
      expect(await card.getAttribute('data-clicks'), 'the press keeps its click').toBe('1')
    } finally { await page.close() }
  })
})
