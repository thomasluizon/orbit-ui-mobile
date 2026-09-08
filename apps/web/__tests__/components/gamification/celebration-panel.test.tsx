import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { Shell412 } from '@/components/shell/shell-412'

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

  it('keeps the screen and composer interactive, rests neutral, and promotes the queued fact when closed', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
    const user = userEvent.setup()
    const { container } = render(
      <Shell412
        notice={<CelebrationPanel />}
        composer={<button type="button">Open Astra</button>}
        tabBar={<div>Tabs</div>}
      >
        <button type="button">Log habit</button>
      </Shell412>,
    )

    const panel = container.querySelector('[data-celebration-panel]')
    expect(panel).not.toHaveAttribute('data-blocking')
    expect(panel?.querySelector('circle:last-of-type')).toHaveAttribute('stroke', 'var(--fg-1)')
    expect(panel).not.toHaveAttribute('aria-modal')
    expect(container.querySelector('[data-shell-background]')).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Log habit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open Astra' })).toBeEnabled()

    screen.getByRole('button', { name: 'close:{}' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Open Astra' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'close:{}' }))
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })
})
