import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
    useScroll: () => ({ scrollY: { get: () => 0 } }),
    useMotionValueEvent: () => {},
    motion: new Proxy({} as Record<string, unknown>, {
      get(_target, tag) {
        if (typeof tag !== 'string') return undefined
        if (!cache.has(tag)) {
          cache.set(
            tag,
            function MotionMock(
              props: Record<string, unknown> & { children?: React.ReactNode; ref?: React.Ref<HTMLElement> },
            ) {
              const { children, initial, animate, exit, transition, ref, ...rest } = props
              return React.createElement(tag, { ...rest, ref }, children)
            },
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

import { HabitRow, type HabitRowActions } from '@/components/habits/habit-row'

function renderRow(actions: HabitRowActions) {
  return render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} actions={actions} />)
}

describe('HabitRow context menu', () => {
  it('opens a menu on right-click whose items call the row handlers', () => {
    const onLog = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderRow({
      onLog,
      onEdit,
      onDelete,
      onSkip: vi.fn(),
      onDetail: vi.fn(),
      onDuplicate: vi.fn(),
      onAddSubHabit: vi.fn(),
    })

    fireEvent.contextMenu(screen.getByTestId('habit-row'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.log' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'contextMenu.delete' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'contextMenu.edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('does not fire the row click when a context-menu item is chosen', () => {
    const onDetail = vi.fn()
    const onDelete = vi.fn()
    renderRow({ onDetail, onDelete })

    fireEvent.contextMenu(screen.getByTestId('habit-row'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'contextMenu.delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDetail).not.toHaveBeenCalled()
  })

  it('does not open a menu in select mode', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Selected' })}
        selectMode
        actions={{ onEdit: vi.fn(), onDelete: vi.fn(), onToggleSelection: vi.fn() }}
      />,
    )

    fireEvent.contextMenu(screen.getByTestId('habit-row'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
