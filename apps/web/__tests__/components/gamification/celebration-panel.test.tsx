import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('motion/react', () => ({ useReducedMotion: () => motion.reduced }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`,
}))

describe('CelebrationPanel', () => {
  beforeEach(() => {
    motion.reduced = false
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('renders the finished fact without motion when reduced motion is enabled', () => {
    motion.reduced = true
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    const { container } = render(<CelebrationPanel />)

    expect(container.querySelector('[data-celebration-panel]')).not.toHaveAttribute('style')
    expect(container.querySelector('.celebration-ring')).toBeNull()
    expect(container.textContent).toContain('day.line:{"count":1}')
  })

  it('is non-blocking, rests neutral, and promotes the queued fact when closed', () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
    const { container } = render(<CelebrationPanel />)

    const panel = container.querySelector('[data-celebration-panel]')
    expect(panel).toHaveAttribute('data-blocking', 'false')
    expect(panel?.querySelector('circle:last-of-type')).toHaveAttribute('stroke', 'var(--fg-1)')
    expect(container.querySelector('[class*="fixed"]')).toBeNull()

    fireEvent.click(screen.getByRole('button'))
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })
})
