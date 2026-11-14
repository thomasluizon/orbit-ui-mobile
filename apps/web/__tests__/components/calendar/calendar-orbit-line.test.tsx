import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { CalendarOrbitLine, type CalendarOrbitLineProps } from '@/app/(app)/calendar/_components/calendar-orbit-line'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const state = vi.hoisted(() => ({ flag: true, profile: {} as Record<string, unknown>, reducedMotion: false }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.flag }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile }) }))

const TODAY = '2026-11-13'

function entry(status: CalendarDayEntry['status'], habitId: string): CalendarDayEntry {
  return { habitId, title: habitId, emoji: null, status, isOneTime: false, isRecurring: true, dueTime: null } as unknown as CalendarDayEntry
}

function props(overrides: Partial<CalendarOrbitLineProps> = {}): CalendarOrbitLineProps {
  return {
    view: 'month', currentMonth: new Date(2026, 10, 1), monthDisplayState: 'ready', selectedDay: TODAY, todayKey: TODAY,
    displayMonthDayMap: new Map([[TODAY, [entry('completed', 'a'), entry('upcoming', 'b'), entry('upcoming', 'c')]], ['2026-11-12', []]]),
    displayRangeDayMap: new Map(), rangeLoading: false,
    weekStart: new Date(2026, 10, 9), weekEnd: new Date(2026, 10, 15), agendaStart: new Date(2026, 10, 13), agendaEnd: new Date(2026, 10, 19),
    rangeModel: { start: new Date(2026, 9, 15), end: new Date(2026, 10, 13) }, isOnline: true, ...overrides,
  }
}

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && state.reducedMotion, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })),
  })
}

function renderLine(lineProps: CalendarOrbitLineProps, locale: 'en' | 'pt-BR' = 'en') {
  const messages = locale === 'en' ? en : ptBR
  const ui = (next: CalendarOrbitLineProps) => <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><CalendarOrbitLine {...next} /></NextIntlClientProvider>
  const view = render(ui(lineProps))
  return { ...view, update: (next: CalendarOrbitLineProps) => view.rerender(ui(next)) }
}

const fetchSpy = vi.fn()
beforeEach(() => {
  state.flag = true
  state.reducedMotion = false
  state.profile = { ...createMockProfile(), aiMessagesUsed: 0, aiMessagesLimit: 50, hasProAccess: true }
  stubMatchMedia()
  vi.stubGlobal('fetch', fetchSpy)
  useUIStore.getState().setAstraConversationOpen(false)
  useChatStore.getState().setDraft('')
})
afterEach(() => { vi.unstubAllGlobals(); fetchSpy.mockReset() })

describe('the Calendário Orbit line', () => {
  it('is absent with the guided flows off, so Calendário keeps its current form', () => {
    state.flag = false
    const { container } = renderLine(props())
    expect(container.innerHTML).toBe('')
  })

  it.each([
    ['en', 'The 13th: 1 of 3 done.'],
    ['pt-BR', 'Dia 13: 1 de 3 feitos.'],
  ] as const)('states the selected day with Orbit at 48 and the sentence as the accessible name in %s', (locale, sentence) => {
    renderLine(props(), locale)
    const row = screen.getByRole('button', { name: sentence })
    expect(row).toBeEnabled()
    const mascots = document.querySelectorAll('[data-asset="orbit-mascot"]')
    expect(mascots).toHaveLength(1)
    expect(mascots[0]!.getAttribute('width')).toBe('48')
    expect(mascots[0]!.getAttribute('data-orbit-face')).toBe('rig')
  })

  it('changes the sentence on a day select and starts no request', () => {
    const view = renderLine(props())
    view.update(props({ selectedDay: '2026-11-12' }))
    expect(screen.getByRole('button', { name: 'Nothing planned that day.' })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('states the future month and the empty month in the line', () => {
    const view = renderLine(props({ monthDisplayState: 'future', currentMonth: new Date(2027, 0, 1), selectedDay: '2027-01-01' }))
    expect(screen.getByRole('button', { name: 'This month has not arrived yet.' })).toBeInTheDocument()
    view.update(props({ monthDisplayState: 'empty' }))
    expect(screen.getByRole('button', { name: 'Nothing planned in November.' })).toBeInTheDocument()
  })

  it('opens the conversation with the selected day offered above the composer', () => {
    renderLine(props())
    fireEvent.click(screen.getByRole('button', { name: 'The 13th: 1 of 3 done.' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().draft).toBe('Tell me about November 13 in my calendar.')
  })

  it.each([
    ['at the message limit', { aiMessagesUsed: 50, aiMessagesLimit: 50 }, true],
    ['offline', {}, false],
  ] as const)('rests Orbit and disables the row with the reason %s, while the day sentence still shows', (_case, profile, isOnline) => {
    state.profile = { ...state.profile, ...profile }
    renderLine(props({ isOnline }))
    const row = screen.getByRole('button', { name: 'The 13th: 1 of 3 done.' })
    expect(row).toBeDisabled()
    const reason = screen.getByTestId('calendar-orbit-line-reason').textContent!
    expect(reason).toBe(isOnline ? 'Today\'s allowance of 50 AI messages is used.' : en.shell.composer.offline.reason)
    expect(row).toHaveAccessibleDescription(reason)
    expect(document.querySelector('[data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state')).toBe('descansando')
  })

  it('shows the skeleton on the same line while the month loads, and no spinner', () => {
    const { container } = renderLine(props({ monthDisplayState: 'loading' }))
    expect(container.querySelector('[data-summary-skeleton]')).not.toBeNull()
    expect(container.querySelector('.animate-spin, [role="progressbar"]')).toBeNull()
    expect(screen.getByRole('button', { name: en.calendar.loading })).toBeDisabled()
  })

  it('states the selected day in the week view and closes up when the day is outside the week', () => {
    const week = new Map([[TODAY, [entry('completed', 'a')]]])
    const view = renderLine(props({ view: 'week', displayRangeDayMap: week }))
    expect(screen.getByRole('button', { name: 'The 13th: all done.' })).toBeInTheDocument()
    view.update(props({ view: 'week', displayRangeDayMap: week, weekStart: new Date(2026, 10, 16), weekEnd: new Date(2026, 10, 22) }))
    expect(screen.queryByTestId('calendar-orbit-line')).toBeNull()
  })

  it('turns the ring once on a page turn, and not under reduced motion', async () => {
    const view = renderLine(props())
    const mascot = () => document.querySelector('[data-asset="orbit-mascot"]')!
    expect(mascot().getAttribute('data-orbit-turn')).toBe('rest')
    act(() => view.update(props({ currentMonth: new Date(2026, 11, 1), selectedDay: '2026-12-01', displayMonthDayMap: new Map() })))
    await waitFor(() => expect(mascot().getAttribute('data-orbit-turn')).toBe('turning'))
    state.reducedMotion = true
    stubMatchMedia()
    view.unmount()
    const still = renderLine(props())
    act(() => still.update(props({ currentMonth: new Date(2026, 11, 1), selectedDay: '2026-12-01', displayMonthDayMap: new Map() })))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(mascot().getAttribute('data-orbit-turn')).toBe('rest')
  })
})

describe('the Calendário header with the Orbit line', () => {
  it('places the line between the month navigation and the view switch', () => {
    render(<CalendarHeader currentMonth={new Date(2026, 10, 1)} todayKey={TODAY} previousMonthLabel="Previous" nextMonthLabel="Next"
      onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
      orbitLine={<div data-testid="orbit-line-slot" />} viewSelector={<div data-testid="view-switch" />} />, { wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider> })
    const group = screen.getByTestId('calendar-header-group')
    const order = [...group.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid'))
    expect(order.indexOf('calendar-month-navigation')).toBeLessThan(order.indexOf('orbit-line-slot'))
    expect(order.indexOf('orbit-line-slot')).toBeLessThan(order.indexOf('view-switch'))
  })
})
