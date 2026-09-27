import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))

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
          cache.set(tag, function MotionMock(
            { children, initial, animate, exit, transition, ...props }: Record<string, unknown> & { children?: React.ReactNode },
          ) {
            return React.createElement(tag, props, children)
          })
        }
        return cache.get(tag)
      },
    }),
  }
})

import { HabitRow } from '@/components/habits/habit-row'

describe('HabitRow overflow menus', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => vi.unstubAllGlobals())

  it('keeps only the second row menu open when its pointerdown is stopped by a row ancestor', () => {
    render(
      <div onPointerDown={(event) => event.stopPropagation()}>
        <HabitRow habit={createMockHabit({ id: 'a', title: 'Meditate' })} actions={{ onEdit: vi.fn() }} />
        <HabitRow habit={createMockHabit({ id: 'b', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
      </div>,
    )

    const [firstTrigger, secondTrigger] = screen.getAllByRole('button', { name: 'habits.actions.more' })
    fireEvent.pointerDown(firstTrigger!)
    fireEvent.click(firstTrigger!)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.pointerDown(secondTrigger!)
    fireEvent.click(secondTrigger!)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'habits.deleteHabit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
  })

  it('closes the menu on a row body press and returns focus to its trigger on Escape', () => {
    render(
      <div onPointerDown={(event) => event.stopPropagation()}>
        <HabitRow habit={createMockHabit({ title: 'Meditate' })} actions={{ onEdit: vi.fn() }} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'habits.actions.more' })
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByTestId('habit-row'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('HabitRow description preview', () => {
  it('renders a single-line description below the title when present', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Meditate', description: 'Ten minutes of breathing' })}
      />,
    )

    expect(screen.getByText('Meditate')).toBeDefined()
    expect(screen.getByText('Ten minutes of breathing')).toBeDefined()
  })

  it('omits the description when the habit has none', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Run', description: null })} />)

    expect(screen.getByText('Run')).toBeDefined()
    expect(screen.queryByText('Ten minutes of breathing')).toBeNull()
  })

  it('renders the description on child (sub-habit) rows too', () => {
    render(
      <HabitRow
        habit={createMockHabit({ title: 'Sub-habit', description: 'Child preview' })}
        child
        depth={1}
      />,
    )

    expect(screen.getByText('Child preview')).toBeDefined()
  })
})

describe('HabitRow check circle accessible name', () => {
  it('announces the state and the log action when the habit is loggable', () => {
    render(<HabitRow habit={createMockHabit({ title: 'Meditate' })} />)

    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute(
      'aria-label',
      'habits.statusDot.empty, habits.logHabit',
    )
  })

  it('announces the unlog action when the habit is done', () => {
    render(
      <HabitRow habit={createMockHabit({ title: 'Meditate' })} state="done" />,
    )

    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute(
      'aria-label',
      'habits.statusDot.done, habits.actions.unlog',
    )
  })
})

describe('HabitRow tags', () => {
  it('renders the habit tag names on the row', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Read',
          tags: [
            { id: '1', name: 'Learning', color: '#7c3aed' },
            { id: '2', name: 'Evening', color: '#10b981' },
          ],
        })}
      />,
    )

    expect(screen.getByText('Learning')).toBeDefined()
    expect(screen.getByText('Evening')).toBeDefined()
  })

  it('caps visible tags at three and shows a +N overflow counter for the rest', () => {
    render(
      <HabitRow
        habit={createMockHabit({
          title: 'Read',
          tags: Array.from({ length: 10 }, (_, i) => ({
            id: String(i),
            name: `Tag${i}`,
            color: '#7c3aed',
          })),
        })}
      />,
    )

    expect(screen.getByText('Tag0')).toBeDefined()
    expect(screen.getByText('Tag1')).toBeDefined()
    expect(screen.getByText('Tag2')).toBeDefined()
    expect(screen.queryByText('Tag3')).toBeNull()
    expect(screen.getByText('+7')).toBeDefined()
  })
})
