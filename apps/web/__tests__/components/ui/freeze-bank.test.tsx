import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const words: FreezeBankWords = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  today: 'Today',
  legendLabel: 'Streak day legend',
  bankedLabel: 'Banked',
  usedLabel: 'Used this month',
  nextLabel: 'Next freeze',
  nextProgressLabel: 'Progress to next freeze',
  nextFreezeProgress: '4 of 7 streak days',
  protectedLabel: 'Protected days',
  protectedEmpty: 'No protected days yet',
  protectedDay: 'Protected',
  protectedToday: 'Protected today',
}

const baseProps = {
  banked: 1,
  ceiling: 3,
  usedThisMonth: 1,
  daysTowardNext: 4,
  earnRateDays: 7,
  tierValue: 'Silver',
  tierLabel: 'Streak tier',
  longestValue: 21,
  longestLabel: 'Best streak',
  protectedDays: [],
  words,
} as const

describe('FreezeBank', () => {
  it('keeps bank bookkeeping inline and discloses the three named marks', () => {
    render(<FreezeBank {...baseProps} />)
    expect(screen.getByText('Banked')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.getByText('Best streak')).toBeInTheDocument()
    expect(screen.getByText('Silver')).toBeInTheDocument()
    expect(screen.getByText('4 of 7 streak days')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7')
    expect(screen.getByText('No protected days yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Streak day legend' }))
    const legend = screen.getByRole('dialog')
    expect(legend).toHaveTextContent('Active')
    expect(legend).toHaveTextContent('Frozen')
    expect(legend).toHaveTextContent('Missed')
    expect(legend).not.toHaveTextContent('Today')

  })

  it('omits the entire earning row while full and resumes after the bank drops', () => {
    const { container, rerender } = render(<FreezeBank {...baseProps} banked={3} />)
    expect(screen.getByText('Banked')).toBeInTheDocument()
    expect(container.querySelector('[data-progress-state="resting"]')).toBeInTheDocument()
    expect(screen.queryByText('Next freeze')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    rerender(<FreezeBank {...baseProps} banked={2} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
  })
})
