import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'

const words: FreezeBankWords = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  today: 'Today',
  legendLabel: 'Streak day legend',
  disclosureCollapsed: 'Show freeze details',
  disclosureExpanded: 'Hide freeze details',
  bankedLabel: 'Banked',
  usedLabel: 'Used this month',
  nextLabel: 'Next freeze',
  nextProgressLabel: 'Progress to next freeze',
  nextFreezeInDays: 'Next freeze in 3 days',
  capacityMessage: 'The bank is full',
  protectedLabel: 'Protected days',
  protectedEmpty: 'No protected days yet',
  protectedDay: 'Protected',
  protectedToday: 'Protected today',
}

const baseProps = {
  banked: 1,
  ceiling: 3,
  usedThisMonth: 1,
  monthlyUseCeiling: 3,
  daysTowardNext: 4,
  earnRateDays: 7,
  tierValue: 'Silver',
  tierLabel: 'Streak tier',
  protectedDays: [],
  words,
} as const

describe('FreezeBank', () => {
  it('names every day state before disclosing bookkeeping', () => {
    render(<FreezeBank {...baseProps} />)
    const legend = screen.getByRole('group', { name: 'Streak day legend' })
    expect(legend).toHaveTextContent('Active')
    expect(legend).toHaveTextContent('Frozen')
    expect(legend).toHaveTextContent('Missed')
    expect(legend).toHaveTextContent('Today')
    expect(screen.queryByText('Banked')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show freeze details' }))
    expect(screen.getByText('Banked')).toBeInTheDocument()
    expect(screen.getByText('No protected days yet')).toBeInTheDocument()
  })

  it('rests the earn bar and states the ceiling when full', () => {
    const { container } = render(
      <FreezeBank {...baseProps} banked={3} defaultExpanded />,
    )
    expect(container.querySelector('[data-bank-state="at-ceiling"]')).toBeInTheDocument()
    expect(screen.getByText('The bank is full')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
