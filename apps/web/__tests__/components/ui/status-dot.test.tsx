import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('uses the shared press scale for interactive feedback', () => {
    render(<StatusDot state="empty" onToggle={() => {}} ariaLabel="run" />)
    const button = screen.getByRole('button')

    expect(button).toHaveStyle('--status-dot-press-scale: 0.96')
    expect(button).toHaveStyle('--status-dot-press-duration: 150ms')
    expect(button).toHaveClass(
      'enabled:active:scale-[var(--status-dot-press-scale)]',
    )
  })

  it('keeps the shared fast alias separate from control hover feedback', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

    expect(css).toMatch(/--dur-fast:\s*160ms;/)
    expect(css).toMatch(/--dur-hover-control:\s*240ms;/)
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
