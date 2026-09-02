import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HabitLogButton } from '@/components/habits/habit-log-button'

vi.mock('@/components/ui/progress-ring', () => ({
  ProgressRing: ({ value }: { value: number }) => <span data-testid="progress-ring">{value}</span>,
}))

vi.mock('@/components/ui/status-ring', () => ({
  StatusRing: ({ status }: { status: string }) => <span data-testid="status-ring">{status}</span>,
}))

describe('HabitLogButton', () => {
  it('announces the log action, shows the empty state, and accepts the action', () => {
    const onPress = vi.fn()
    render(<HabitLogButton label="Log Read" logged={false} onPress={onPress} />)

    fireEvent.click(screen.getByRole('button', { name: 'Log Read' }))

    expect(screen.getByTestId('status-ring')).toHaveTextContent('empty')
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('shows visible partial progress until the habit is complete', () => {
    const view = render(
      <HabitLogButton label="Log Read" logged={false} completed={false} progress={0.5} onPress={vi.fn()} />,
    )

    expect(screen.getByTestId('progress-ring')).toHaveTextContent('0.5')

    view.rerender(
      <HabitLogButton label="Unlog Read" logged completed progress={1} onPress={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Unlog Read' })).toBeInTheDocument()
    expect(screen.getByTestId('status-ring')).toHaveTextContent('done')
  })
})
