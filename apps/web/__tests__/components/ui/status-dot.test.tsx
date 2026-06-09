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

  it('plays the completion sweep on an interactive transition into done', () => {
    const { container, rerender } = render(
      <StatusDot state="empty" onToggle={() => {}} ariaLabel="run" />,
    )
    expect(container.querySelector('svg')).toBeNull()

    rerender(<StatusDot state="done" onToggle={() => {}} ariaLabel="run" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does not sweep for a dot that mounts already done', () => {
    const { container } = render(
      <StatusDot state="done" onToggle={() => {}} ariaLabel="run" />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('does not sweep a read-only dot (no onToggle)', () => {
    const { container, rerender } = render(<StatusDot state="empty" ariaLabel="run" />)
    rerender(<StatusDot state="done" ariaLabel="run" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders read-only dots without button semantics', () => {
    render(<StatusDot state="done" ariaLabel="On track" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: 'On track' })).toBeInTheDocument()
  })
})
