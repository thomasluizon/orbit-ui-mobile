import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/astra-avatar', () => ({
  AstraMark: () => <span data-testid="astra-mark" />,
}))

import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'

describe('BottomTabBar', () => {
  it('shows an enabled FAB only on Today', () => {
    const onFab = vi.fn()
    render(<BottomTabBar active="today" onFab={onFab} />)
    const fab = screen.getByRole('button', { name: 'create' })
    expect(fab).not.toBeDisabled()
    fireEvent.click(fab)
    expect(onFab).toHaveBeenCalledTimes(1)
  })

  it('renders the FAB disabled and inert away from Today', () => {
    const onFab = vi.fn()
    render(<BottomTabBar active="calendar" onFab={onFab} />)
    const fab = screen.getByRole('button', { name: 'create' })
    expect(fab).toBeDisabled()
    expect(fab).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(fab)
    expect(onFab).not.toHaveBeenCalled()
  })

  it('hides the FAB on the Astra tab and when showFab is false', () => {
    const { rerender } = render(<BottomTabBar active="chat" />)
    expect(screen.queryByRole('button', { name: 'create' })).not.toBeInTheDocument()
    rerender(<BottomTabBar active="today" showFab={false} />)
    expect(screen.queryByRole('button', { name: 'create' })).not.toBeInTheDocument()
  })

  it('marks the active tab with aria-current and routes tab presses', () => {
    const onTab = vi.fn()
    render(<BottomTabBar active="profile" onTab={onTab} />)
    const you = screen.getByRole('button', { name: 'you' })
    expect(you).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'home' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'calendar' }))
    expect(onTab).toHaveBeenCalledWith('calendar')
  })

  it('does not throw when tab handlers are omitted', () => {
    render(<BottomTabBar active="today" />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'home' }))).not.toThrow()
  })
})
