import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pager } from '@/components/ui/pager'

const words = { count: 5, label: 'Onboarding steps', backLabel: 'Previous step', forwardLabel: 'Continue' }

describe('Pager', () => {
  it('reports moves without changing its position and does not auto advance', () => {
    vi.useFakeTimers()
    try {
      const onForward = vi.fn()
      const { rerender } = render(<Pager {...words} index={0} onForward={onForward} />)
      expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Previous step' }))
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      expect(onForward).toHaveBeenCalledTimes(1)
      void act(() => vi.advanceTimersByTime(60000))
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
      rerender(<Pager {...words} index={2} />)
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step')
    } finally { vi.useRealTimers() }
  })
  it('labels the group, marks one current segment and renders the closing action', () => {
    const onBack = vi.fn()
    const { rerender } = render(<Pager {...words} count={6} index={3} onBack={onBack} />)
    expect(screen.getByRole('list', { name: words.label })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((segment) => segment.hasAttribute('aria-current'))).toEqual([screen.getAllByRole('listitem')[3]])
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    rerender(<Pager index={5} count={6} label={words.label} backLabel={words.backLabel} forwardSlot={<button type="button">Share recap</button>} />)
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share recap' })).toBeInTheDocument()
  })
})
