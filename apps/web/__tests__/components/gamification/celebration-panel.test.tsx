import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { Shell412 } from '@/components/shell/shell-412'

const motion = vi.hoisted(() => ({ reduced: false }))
const selectPlural = vi.hoisted(() => vi.fn((text: string) => `selected:${text}`))

vi.mock('motion/react', () => ({ useReducedMotion: () => motion.reduced }))
vi.mock('@/lib/plural', () => ({ plural: selectPlural }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`,
}))

describe('CelebrationPanel', () => {
  beforeEach(() => {
    motion.reduced = false
    selectPlural.mockClear()
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('renders the finished fact without motion when reduced motion is enabled', () => {
    motion.reduced = true
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    const { container } = render(<CelebrationPanel />)

    expect(container.querySelector('[data-celebration-panel]')).not.toHaveAttribute('style')
    expect(container.querySelector('.celebration-ring')).toBeNull()
    expect(selectPlural).toHaveBeenCalledWith('day.line:{"count":1}', 1)
    expect(container.textContent).toContain('selected:day.line:{"count":1}')
  })

  it('renders the goal unit and uses a complete sentence when the unit is empty', () => {
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Distance',
      count: 5,
      unit: 'km',
    })
    const { container, rerender } = render(<CelebrationPanel />)

    expect(container.textContent).toContain(
      'goal.line:{"name":"Distance","count":5,"unit":"km"}',
    )

    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Untitled target',
      count: 1,
      unit: '',
    })
    rerender(<CelebrationPanel />)

    expect(container.textContent).toContain(
      'goal.lineWithoutUnit:{"name":"Untitled target","count":1}',
    )
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

    const closeButton = screen.getByRole('button', { name: 'close:{}' })
    closeButton.focus()
    await user.keyboard('{Enter}')
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
    const promotedPanel = container.querySelector('[data-celebration-panel]')
    expect(promotedPanel).not.toBe(panel)
    expect(screen.getByRole('button', { name: 'close:{}' })).toHaveFocus()
    expect(promotedPanel).toHaveStyle({
      animation: 'celebration-rise 280ms var(--ease-out) both',
    })
  })
})
