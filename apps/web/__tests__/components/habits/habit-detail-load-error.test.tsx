import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'

afterEach(cleanup)
const mascot = () => document.querySelector('svg[data-asset="orbit-mascot"]')

describe('web habit detail load error', () => {
  it('shows Orbit in Parado above the message and the retry, in the centred region', () => {
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

  it('says the read needs a connection, with Orbit in Parado and the retry, when the read failed offline', () => {
    render(<HabitDetailLoadError message="Could not load" offlineMessage="Check your connection" error={new TypeError('Failed to fetch')} retryLabel="Retry" onRetry={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Could not load')
    expect(mascot()).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
