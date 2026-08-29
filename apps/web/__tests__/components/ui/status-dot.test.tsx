import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { StatusDot } from '@/components/ui/status-dot'

describe('StatusDot', () => {
  it('renders a labelled toggle button', () => {
    render(<StatusDot state="empty" onToggle={() => {}} ariaLabel="Morning run" />)
    expect(screen.getByRole('button', { name: 'Morning run' })).toBeInTheDocument()
  })

  it('calls onToggle when tapped', () => {
    const onToggle = vi.fn()
    render(<StatusDot state="empty" onToggle={onToggle} ariaLabel="run" />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('keeps completion static when an interactive dot becomes done', () => {
    const { container, rerender } = render(
      <StatusDot state="empty" onToggle={() => {}} ariaLabel="run" />,
    )
    expect(container.querySelector('svg')).toBeNull()

    rerender(<StatusDot state="done" onToggle={() => {}} ariaLabel="run" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders read-only dots without button semantics', () => {
    render(<StatusDot state="done" ariaLabel="On track" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: 'On track' })).toBeInTheDocument()
  })
})
