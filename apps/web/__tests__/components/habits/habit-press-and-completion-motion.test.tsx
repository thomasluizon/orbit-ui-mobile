import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { HabitRowTrailing } from '@/components/habits/habit-row-trailing'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitDrill } from '@/components/habits/habit-list/habit-drill'
import { ListScope } from '@/components/motion/list-motion'
import { scaleTransition } from '@/__tests__/support/press-transition'

import { motionSprings, resolveMotionPreset } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
const settle = vi.hoisted(() => {
  const controls = { stop: vi.fn(), complete: vi.fn() }
  return { controls, animate: vi.fn(() => controls) }
})
vi.mock('motion/react', async (importOriginal) => ({ ...(await importOriginal<typeof import('motion/react')>()), animate: settle.animate }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => preference.reduced }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeEach(() => { preference.reduced = false; settle.animate.mockClear(); settle.controls.stop.mockClear(); settle.controls.complete.mockClear() })

describe('check press feedback', () => {
  it('scales on the press duration and never on the control hover duration', () => {
    render(<CheckCircle state="empty" onToggle={vi.fn()} disabled={false} ariaLabel="Log" />)
    const control = screen.getByRole('button', { name: 'Log' })
    expect(control.className).toContain('duration-[var(--dur-press)]')
    expect(control.className).toContain('ease-[var(--ease-out)]')
    expect(control.className).not.toContain('--dur-hover-control')
    expect(control.className).toContain('motion-safe:active:scale-[0.96]')
  })
})

describe('parent row check press feedback', () => {
  it('scales on the press duration and never on the control hover duration', () => {
    const habit = createMockHabit({ title: 'Parent' })
    render(<HabitRowTrailing habit={habit} hasChildren childProgress={{ done: 1, total: 3 }} state="empty" isDone={false} canLog
      menuItems={[]} onMenuSelect={vi.fn()} actions={{ onLog: vi.fn(), onUnlog: vi.fn() } as never} onToggleStatus={vi.fn()}
      completionReadOnly={false} completionStatusUnavailable={false} />)
    const control = document.querySelector('[data-habit-row-control="check"]')!
    expect(control.className).toContain('duration-[var(--dur-press)]')
    expect(control.className).toContain('ease-[var(--ease-out)]')
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
    expect(scaleTransition(back)).toBe('var(--dur-press) var(--ease-out)')
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

  it('springs the mounted check from the success scale to rest with the completion spring', () => {
    const view = render(<HabitCheck status="empty" label="Open" />)
    expect(settle.animate).not.toHaveBeenCalled()
    view.rerender(<HabitCheck status="done" label="Done" />)
    view.rerender(<HabitCheck status="done" label="Done again" />)
    expect(settle.animate).toHaveBeenCalledOnce()
    expect(settle.animate).toHaveBeenCalledWith(view.container.querySelector('[data-habit-check]'), { scale: [resolveMotionPreset('success-feedback').scaleFrom, 1] }, { type: 'spring', ...motionSprings.completion })
  })

  it('finishes the spring at rest when the check turns back before it settles', () => {
    const view = render(<HabitCheck status="empty" label="Open" />)
    view.rerender(<HabitCheck status="done" label="Done" />)
    view.rerender(<HabitCheck status="empty" label="Open" />)
    expect(settle.controls.complete).toHaveBeenCalledOnce()
    expect(settle.controls.stop).not.toHaveBeenCalled()
  })

  it('leaves no inline transform on the check when it turns back after the spring', () => {
    const view = render(<HabitCheck status="empty" label="Open" />)
    view.rerender(<HabitCheck status="done" label="Done" />)
    const check = view.container.querySelector<HTMLElement>('[data-habit-check]')!
    /** motion-dom `buildHTMLStyles` writes `transform: none` when the scale reaches 1. */
    check.style.transform = 'none'
    view.rerender(<HabitCheck status="empty" label="Open" />)
    expect(check.getAttribute('style')).not.toContain('transform')
  })

  it('mounts no motion for a check that first renders done', () => {
    render(<HabitCheck status="done" label="Done" />)
    expect(settle.animate).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'a logged habit', before: { status: 'empty' }, after: { status: 'done' } },
    { name: 'a parent whose sub-habits are all done', before: { status: 'empty', progress: { done: 1, total: 2 } }, after: { status: 'empty', progress: { done: 2, total: 2 } } },
  ] as const)('stays still when $name turns done in the same render as a list scope change', ({ before, after }) => {
    const view = render(<ListScope scope="yesterday"><HabitCheck {...before} label="Check" /></ListScope>)
    view.rerender(<ListScope scope="today"><HabitCheck {...after} label="Check" /></ListScope>)
    expect(view.container.querySelector('[data-habit-check]')).toHaveStyle({ background: 'var(--fg-1)' })
    expect(view.container.querySelector('[data-habit-check-settle]')).toBeNull()
    expect(settle.animate).not.toHaveBeenCalled()
  })

  it('settles a mounted check that turns done while the list scope stays the same', () => {
    const view = render(<ListScope scope="today"><HabitCheck status="empty" label="Open" /></ListScope>)
    view.rerender(<ListScope scope="today"><HabitCheck status="done" label="Done" /></ListScope>)
    expect(view.container.querySelector('[data-habit-check-settle]')).not.toBeNull()
    expect(settle.animate).toHaveBeenCalledOnce()
  })

  it('plays nothing under reduced motion', () => {
    preference.reduced = true
    const view = render(<HabitCheck status="empty" label="Open" />)
    view.rerender(<HabitCheck status="done" label="Done" />)
    expect(view.container.querySelector('[data-habit-check-settle]')).toBeNull()
    expect(settle.animate).not.toHaveBeenCalled()
  })
})
