import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitDrill } from '@/components/habits/habit-list/habit-drill'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => preference.reduced }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeEach(() => { preference.reduced = false })

describe('check press feedback', () => {
  it('scales on the press duration and never on the control hover duration', () => {
    render(<CheckCircle state="empty" onToggle={vi.fn()} disabled={false} ariaLabel="Log" />)
    const control = screen.getByRole('button', { name: 'Log' })
    expect(control.className).toContain('duration-[var(--dur-press)]')
    expect(control.className).not.toContain('--dur-hover-control')
    expect(control.className).toContain('motion-safe:active:scale-[0.96]')
  })
})

describe('drill back press feedback', () => {
  it('scales on the press duration and only when motion is allowed', () => {
    const drill = {
      drillStack: ['habit-1'], currentParentId: 'habit-1', currentParent: createMockHabit({ title: 'Parent' }),
      drillChildren: [], settlementHabitsById: new Map(), settlementUpdatedAtById: new Map(), hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
      drillLoading: false, drillError: '', drillInto: vi.fn(async () => {}), drillBack: vi.fn(), drillReset: vi.fn(),
      refreshCurrent: vi.fn(async () => {}), getDrillChildren: () => [],
    }
    render(<HabitDrill drill={drill} t={(key) => key} renderHabitCard={() => null} onAddSubHabit={vi.fn()} />)
    const back = screen.getByRole('button', { name: 'common.back' })
    expect(back.className).toContain('motion-safe:active:scale-[0.96]')
    expect(back.className).not.toMatch(/(^|\s)active:scale-/)
    expect(back.className).toContain('duration-[var(--dur-hover-control),var(--dur-press)]')
    expect(back.className).toContain('transition-[background-color,scale]')
  })
})

describe('completion feedback', () => {
  it('stays still when a check first renders done', () => {
    const { container } = render(<HabitCheck status="done" label="Done" />)
    expect(container.querySelector('[data-habit-check-settle]')).toBeNull()
  })

  it('settles the check once when a mounted check turns done', () => {
    const view = render(<HabitCheck status="empty" label="Open" />)
    expect(view.container.querySelector('[data-habit-check-settle]')).toBeNull()
    view.rerender(<HabitCheck status="done" label="Done" />)
    expect(view.container.querySelector('[data-habit-check-settle]')).not.toBeNull()
    view.rerender(<HabitCheck status="empty" label="Open" />)
    expect(view.container.querySelector('[data-habit-check-settle]')).toBeNull()
  })

  it('plays nothing under reduced motion', () => {
    preference.reduced = true
    const view = render(<HabitCheck status="empty" label="Open" />)
    view.rerender(<HabitCheck status="done" label="Done" />)
    expect(view.container.querySelector('[data-habit-check-settle]')).toBeNull()
  })
})
