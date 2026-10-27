import { readFileSync } from 'node:fs'
import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { SelectionIndicator } from '@/components/ui/selection-indicator'

describe('interaction motion', () => {
  it('keeps selection paint inside the control', () => {
    const view = render(<SelectionIndicator id="selection" calendar />)
    expect(view.container.querySelector('[data-selection-motion]')).toHaveClass('absolute', 'inset-0', 'rounded-[inherit]')
    const stylesheet = readFileSync('app/globals.css', 'utf8')
    expect(stylesheet).toMatch(/\[data-selection-motion\] \{ transform: none !important/)
  })
  it('changes the completion fill without delaying a toggle or adding bounce', () => {
    const onToggle = vi.fn()
    const view = render(<CheckCircle state="empty" onToggle={onToggle} disabled={false} ariaLabel="Complete" />)
    fireEvent.click(view.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
    view.rerender(<CheckCircle state="done" onToggle={onToggle} disabled={false} ariaLabel="Complete" />)
    expect(view.container.querySelector('[data-habit-check]')).toHaveClass('habit-check-motion')
    expect(view.container.querySelector('.animate-check-pop')).toBeNull()
  })

  it('keeps reduced-motion presses at unit scale and uses the shared duration', () => {
    const stylesheet = readFileSync('app/globals.css', 'utf8')
    expect(stylesheet).toMatch(/habit-check-motion\s*\{\s*transition: background-color var\(--dur-press\)/)
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:is\(button, a,.*?:active\s*\{\s*scale: 1 !important/s)
  })
})
