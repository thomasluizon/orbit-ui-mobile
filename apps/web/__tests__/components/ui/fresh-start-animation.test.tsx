import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'

describe('FreshStartAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the animation overlay via portal', () => {
    render(<FreshStartAnimation onComplete={vi.fn()} />)
    const output = document.querySelector('output')
    expect(output).toBeInTheDocument()
  })

  it('displays success title text', () => {
    render(<FreshStartAnimation onComplete={vi.fn()} />)
    expect(document.body.textContent).toContain('profile.freshStart.successTitle')
  })

  it('displays success subtitle text', () => {
    render(<FreshStartAnimation onComplete={vi.fn()} />)
    expect(document.body.textContent).toContain('profile.freshStart.successSubtitle')
  })

  it('has assertive aria-live for screen readers', () => {
    render(<FreshStartAnimation onComplete={vi.fn()} />)
    const output = document.querySelector('output')
    expect(output).toHaveAttribute('aria-live', 'assertive')
  })

  it('calls onComplete after animation duration', () => {
    const onComplete = vi.fn()
    render(<FreshStartAnimation onComplete={onComplete} />)
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders the RefreshCw icon', () => {
    render(<FreshStartAnimation onComplete={vi.fn()} />)
    const svg = document.querySelector('.fresh-start-orb svg')
    expect(svg).toBeInTheDocument()
  })
})
