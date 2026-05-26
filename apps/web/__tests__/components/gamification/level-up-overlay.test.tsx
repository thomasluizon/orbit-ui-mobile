import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'

describe('LevelUpOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when not leveled up', () => {
    const { container } = render(
      <LevelUpOverlay leveledUp={false} newLevel={null} onClear={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders overlay when leveled up', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toBeInTheDocument()
  })

  it('displays the new level number padded to two digits', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('05')
  })

  it('displays level up title', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('gamification.levelUp.title')
  })

  it('displays steady hand quiet copy', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('gamification.levelUp.steadyHand')
  })

  it('renders the rotating orbit ring SVG', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    expect(document.querySelector('ellipse')).toBeInTheDocument()
  })

  it('has alert role with aria-atomic for accessibility', () => {
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={vi.fn()} />,
    )
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toHaveAttribute('aria-atomic', 'true')
  })

  it('calls onClear after animation duration', () => {
    const onClear = vi.fn()
    render(
      <LevelUpOverlay leveledUp={true} newLevel={5} onClear={onClear} />,
    )
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3400)
    })
    expect(onClear).toHaveBeenCalled()
  })
})
