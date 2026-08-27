import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { StatusRing } from '@/components/ui/status-ring'

const STATUSES: readonly NonNullable<StatusRingProps['status']>[] = [
  'empty',
  'done',
  'overdue',
  'bad',
]

describe('StatusRing', () => {
  it.each(STATUSES)('renders the %s state with its caller-supplied name', (status) => {
    render(<StatusRing status={status} label={`${status} status`} />)

    expect(screen.getByRole('img', { name: `${status} status` })).toHaveAttribute(
      'data-status',
      status,
    )
  })

  it('puts a check inside only the done state', () => {
    const { container, rerender } = render(
      <StatusRing status="overdue" label="Overdue" />,
    )
    expect(container.querySelector('svg')).toBeNull()

    rerender(<StatusRing status="done" label="Done" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
