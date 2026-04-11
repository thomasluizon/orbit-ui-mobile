import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'

vi.mock('lucide-react', () => ({
  WifiOff: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement('svg', { ...props, 'data-testid': 'wifi-off-icon' }),
}))

describe('OfflineUnavailableState', () => {
  it('renders title and description', () => {
    render(
      <OfflineUnavailableState
        title="You're offline"
        description="This feature requires an internet connection."
      />,
    )
    expect(screen.getByText("You're offline")).toBeInTheDocument()
    expect(
      screen.getByText('This feature requires an internet connection.'),
    ).toBeInTheDocument()
  })

  it('renders as an alert region', () => {
    render(
      <OfflineUnavailableState
        title="Offline"
        description="Connect to use this feature."
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders the wifi-off icon', () => {
    render(
      <OfflineUnavailableState title="Offline" description="No connection" />,
    )
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument()
  })

  it('renders action button when label and handler provided', () => {
    const onAction = vi.fn()
    render(
      <OfflineUnavailableState
        title="Offline"
        description="No connection"
        actionLabel="Retry"
        onAction={onAction}
      />,
    )
    const button = screen.getByText('Retry')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('does not render action button when no label', () => {
    render(
      <OfflineUnavailableState title="Offline" description="No connection" />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('disables action button when disabled prop is true', () => {
    render(
      <OfflineUnavailableState
        title="Offline"
        description="No connection"
        actionLabel="Retry"
        onAction={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByText('Retry')).toBeDisabled()
  })

  it('has accessible aria-label combining title and description', () => {
    render(
      <OfflineUnavailableState
        title="Offline"
        description="No connection"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-label', 'Offline. No connection')
  })
})
