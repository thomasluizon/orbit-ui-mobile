import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Switch } from '@/components/ui/switch'

describe('Switch', () => {
  it('renders as a switch role element', () => {
    render(<Switch checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects checked state via aria-checked', () => {
    const { rerender } = render(<Switch checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')

    rerender(<Switch checked={true} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with toggled value on click', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when currently checked', () => {
    const onChange = vi.fn()
    render(<Switch checked={true} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('disables the switch when disabled prop is true', () => {
    render(<Switch checked={false} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('renders label text when provided', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Notifications" />)
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })

  it('renders description text when provided', () => {
    render(
      <Switch
        checked={false}
        onChange={vi.fn()}
        label="Notifications"
        description="Enable push notifications"
      />,
    )
    expect(screen.getByText('Enable push notifications')).toBeInTheDocument()
  })

  it('does not render description when label is not set', () => {
    render(
      <Switch checked={false} onChange={vi.fn()} description="Some description" />,
    )
    // Without a label, the component just wraps the switch in a div
    expect(screen.queryByText('Some description')).not.toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(
      <Switch checked={false} onChange={vi.fn()} className="my-switch" />,
    )
    expect(container.firstChild).toHaveClass('my-switch')
  })
})
