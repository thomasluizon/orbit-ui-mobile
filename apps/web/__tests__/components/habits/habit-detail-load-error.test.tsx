import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'

afterEach(cleanup)
const mascot = () => document.querySelector('svg[data-asset="orbit-mascot"]')

describe('web habit detail load error', () => {
  it('shows Orbit in Parado above the message and the retry, in the centred region', () => {
    enableTestFlags('orbit_guided_flows')
    const onRetry = vi.fn()
    render(<HabitDetailLoadError message="Could not load" retryLabel="Retry" onRetry={onRetry} />)
    expect(mascot()).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascot()).toHaveAttribute('width', '96')
    expect(mascot()!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(document.querySelector('[data-shell-centred-region] [data-habit-detail-load-error]')).not.toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders the current error with the flag off', () => {
    render(<HabitDetailLoadError message="Could not load" retryLabel="Retry" onRetry={vi.fn()} />)
    expect(mascot()).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
