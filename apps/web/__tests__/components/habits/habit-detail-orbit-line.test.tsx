import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailOrbitLine } from '@/components/habits/habit-detail-orbit-line'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => values?.done === undefined ? key : `${key}:${values.done}`,
}))

const habit = { id: 'habit-1', title: 'Read' } as NormalizedHabit
const week = (done: number): HabitDayValue[] => [...Array.from({ length: 30 - 7 }, () => 'done' as const), ...Array.from({ length: 7 }, (_, index) => (index < done ? 'done' as const : 'missed' as const))]
const mascot = (container: HTMLElement) => container.querySelector<SVGElement>('[data-asset="orbit-mascot"]')!

afterEach(() => {
  cleanup()
  useChatStore.getState().setDraft('')
  useUIStore.setState({ orbitConversationOpen: false })
})

describe('web habit detail Orbit line', () => {
  it('states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation', () => {
    const { container } = render(<HabitDetailOrbitLine habit={habit} days={week(5)} />)
    expect(mascot(container)).toHaveAttribute('width', '48')
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.orbit.lastSevenDays:5' }))
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
    expect(useChatStore.getState().draft).toBe('habits.detail.askOrbitSeedDefault')
  })

  it('never counts a miss: a week with nothing done shows the review label and no number', () => {
    render(<HabitDetailOrbitLine habit={habit} days={week(0)} />)
    expect(screen.getByRole('button', { name: 'habits.detail.askOrbit' })).toBeInTheDocument()
    expect(screen.queryByText(/lastSevenDays/)).toBeNull()
  })


  it('shows Orbit in Pensando while the reschedule suggestion loads', () => {
    const { container, rerender } = render(<HabitDetailOrbitLine habit={habit} days={week(5)} thinking />)
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'pensando')
    rerender(<HabitDetailOrbitLine habit={habit} days={week(5)} />)
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
  })
})
