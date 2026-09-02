import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toast } from '@/components/ui/toast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

function revealMessage() {
  void act(() => vi.advanceTimersByTime(0))
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    void act(() => vi.runOnlyPendingTimers())
    vi.useRealTimers()
  })

  it('calls onDone once at the default 5000ms and never before', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" onDone={onDone} />)

    void act(() => vi.advanceTimersByTime(4999))
    expect(onDone).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
    void act(() => vi.advanceTimersByTime(25000))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('clamps a short done life to 5000ms', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={2000} onDone={onDone} />)

    void act(() => vi.advanceTimersByTime(2000))
    expect(onDone).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(3000))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('honors a longer done life exactly once', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={8000} onDone={onDone} />)

    void act(() => vi.advanceTimersByTime(7999))
    expect(onDone).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
    void act(() => vi.advanceTimersByTime(22000))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses while hovered and resumes after the pointer leaves', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const region = screen.getByRole('status')

    void act(() => vi.advanceTimersByTime(1000))
    fireEvent.pointerEnter(region)
    void act(() => vi.advanceTimersByTime(30000))
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.pointerLeave(region)
    void act(() => vi.advanceTimersByTime(3999))
    expect(onDone).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses while focused and resumes after focus leaves', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const region = screen.getByRole('status')

    fireEvent.focus(region)
    void act(() => vi.advanceTimersByTime(30000))
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.blur(region)
    void act(() => vi.advanceTimersByTime(5000))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps lost feedback mounted and calls its action once per press', () => {
    const onAction = vi.fn()
    render(
      <Toast
        kind="lost"
        message="The change was lost."
        detail="Do it again."
        actionLabel="Retry"
        onAction={onAction}
      />,
    )
    revealMessage()

    void act(() => vi.advanceTimersByTime(30000))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  it('calls a neutral action but does nothing when its host removes it', () => {
    const onAction = vi.fn()
    const first = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={onAction} />,
    )
    revealMessage()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    first.unmount()

    const untouched = vi.fn()
    const second = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={untouched} />,
    )
    second.unmount()
    expect(untouched).not.toHaveBeenCalled()
  })

  it('draws the working mark itself and never renders an icon slot', () => {
    const { container } = render(<Toast kind="working" message="Saving" />)

    expect(container.querySelector('[data-working-mark]')).not.toBeNull()
    expect(container.querySelector('[data-done-mark]')).toBeNull()
  })

  it('uses polite status regions except for assertive lost feedback', () => {
    const { rerender } = render(<Toast kind="neutral" message="Fact" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    rerender(<Toast kind="working" message="Working" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    rerender(<Toast kind="done" message="Done" onDone={() => {}} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    rerender(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })

  it('does not move focus when any kind mounts', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    anchor.focus()
    const activeElement = document.activeElement

    const { rerender } = render(<Toast kind="neutral" message="Fact" />)
    expect(document.activeElement).toBe(activeElement)
    rerender(<Toast kind="working" message="Working" />)
    expect(document.activeElement).toBe(activeElement)
    rerender(<Toast kind="done" message="Done" onDone={() => {}} />)
    expect(document.activeElement).toBe(activeElement)
    rerender(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )
    expect(document.activeElement).toBe(activeElement)
    anchor.remove()
  })

  it('mounts an empty stable live region before writing the message', () => {
    render(<Toast kind="neutral" message="Fact" />)
    const region = screen.getByRole('status')

    expect(region).not.toHaveTextContent('Fact')
    revealMessage()
    expect(region).toHaveTextContent('Fact')
  })

  it('draws completion on status-done and never paints it with the accent', () => {
    const { container } = render(<Toast kind="done" message="Saved" onDone={() => {}} />)
    const mark = container.querySelector('[data-done-mark]') as HTMLElement

    expect(mark.className).toContain('bg-[var(--status-done)]')
    expect(mark.className).not.toContain('primary')

    for (const mode of ['dark', 'light'] as const) {
      const variables = resolveWebThemeVariables('purple', mode)
      expect(variables['--status-done']).toBe(variables['--fg-1'])
      expect(variables['--status-done']).not.toBe(variables['--primary'])
    }
  })
})
