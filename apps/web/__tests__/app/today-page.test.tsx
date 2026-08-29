import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { TodayHeaderRegion } from '@/app/(app)/today-page-view'
import { TodayDateControl } from '@/app/(app)/today-shell'
import type { TodayView } from '@/app/(app)/use-today-page'

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

vi.mock('@/components/ui/icons', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}))

vi.mock('@/components/habits/habit-list', () => ({ HabitList: () => null }))
vi.mock('@/components/habits/bulk-action-bar-v2', () => ({ BulkActionBarV2: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/ui/capacity-notice', () => ({
  CapacityNotice: ({ message }: { message: string }) => <div>{message}</div>,
}))

const baseProps = {
  dayName: 'Wednesday',
  numericDate: '08/04/2026',
  isTodaySelected: true,
  nextDisabled: false,
  onGoToPreviousDay: vi.fn(),
  onGoToToday: vi.fn(),
  onGoToNextDay: vi.fn(),
  previousLabel: 'Previous day',
  todayLabel: 'Today',
  nextLabel: 'Next day',
}

describe('Hoje date control', () => {
  it('shows the day name over the numeric date', () => {
    render(<TodayDateControl {...baseProps} />)
    expect(screen.getByText('Wednesday')).toBeInTheDocument()
    expect(screen.getByText('08/04/2026')).toBeInTheDocument()
  })

  it('shows the jump only away from today', () => {
    const onGoToToday = vi.fn()
    render(<TodayDateControl {...baseProps} isTodaySelected={false} onGoToToday={onGoToToday} />)
    fireEvent.click(screen.getByText('Today'))
    expect(onGoToToday).toHaveBeenCalledOnce()
  })

  it('disables the forward step at the instance horizon', () => {
    render(<TodayDateControl {...baseProps} nextDisabled />)
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  it('renders the resolved read-only boundary notice', () => {
    const view = {
      nav: {
        dateStr: '2026-03-31',
        today: '2026-04-08',
        dateNav: { ...baseProps, isTodaySelected: false },
      },
    } as unknown as TodayView

    render(
      <TestIntlProvider locale="en" messages={en}>
        <TodayHeaderRegion view={view} />
      </TestIntlProvider>,
    )

    expect(screen.getByText(en.habits.todayBoundary.readOnly)).toBeInTheDocument()
  })
})
