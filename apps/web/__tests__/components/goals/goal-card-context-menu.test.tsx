import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

vi.mock('motion/react', async () => {
  const React = await import('react')
  const cache = new Map<string, unknown>()
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    motion: new Proxy({} as Record<string, unknown>, {
      get(_target, tag) {
        if (typeof tag !== 'string') return undefined
        if (!cache.has(tag)) {
          cache.set(
            tag,
            React.forwardRef(function MotionMock(
              props: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLElement>,
            ) {
              const { children, initial, animate, exit, transition, ...rest } = props
              return React.createElement(tag, { ...rest, ref }, children)
            }),
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({
    open,
    initialAction,
  }: {
    open: boolean
    initialAction?: string | null
  }) =>
    open ? (
      <div data-testid="goal-detail-drawer" data-initial-action={initialAction ?? ''} />
    ) : null,
}))

import { GoalCard } from '@/components/goals/goal-card'
import type { Goal } from '@orbit/shared/types/goal'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '1',
    title: 'Read 12 books',
    description: null,
    targetValue: 12,
    currentValue: 3,
    unit: 'books',
    status: 'Active',
    deadline: null,
    position: 0,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 25,
    ...overrides,
  }
}

describe('GoalCard context menu', () => {
  it('opens a menu on right-click with the goal actions', () => {
    render(<GoalCard goal={makeGoal()} />)

    fireEvent.contextMenu(screen.getByText('Read 12 books'))

    expect(screen.getByRole('menuitem', { name: 'contextMenu.viewDetails' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.complete' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.delete' })).toBeInTheDocument()
  })

  it('deep-links the drawer into the edit action', () => {
    render(<GoalCard goal={makeGoal()} />)

    fireEvent.contextMenu(screen.getByText('Read 12 books'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'contextMenu.edit' }))

    const drawer = screen.getByTestId('goal-detail-drawer')
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveAttribute('data-initial-action', 'edit')
  })

  it('opens the drawer with no action for view details', () => {
    render(<GoalCard goal={makeGoal()} />)

    fireEvent.contextMenu(screen.getByText('Read 12 books'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'contextMenu.viewDetails' }))

    expect(screen.getByTestId('goal-detail-drawer')).toHaveAttribute('data-initial-action', '')
  })

  it('omits complete for a non-active goal', () => {
    render(<GoalCard goal={makeGoal({ status: 'Completed' })} />)

    fireEvent.contextMenu(screen.getByText('Read 12 books'))

    expect(screen.queryByRole('menuitem', { name: 'contextMenu.complete' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.delete' })).toBeInTheDocument()
  })
})
