import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailOrbitLine, HabitDetailReviewRow } from '@/components/habits/habit-detail-orbit-line'
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
  useUIStore.setState({ astraConversationOpen: false })
})

describe('web habit detail Orbit line', () => {
  it('states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation', () => {
    enableTestFlags('orbit_guided_flows')
    const { container } = render(<HabitDetailOrbitLine habit={habit} days={week(5)} />)
    expect(mascot(container)).toHaveAttribute('width', '48')
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.orbit.lastSevenDays:5' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().draft).toBe('habits.detail.askAstraSeedDefault')
  })

  it('never counts a miss: a week with nothing done shows the review label and no number', () => {
    enableTestFlags('orbit_guided_flows')
    render(<HabitDetailOrbitLine habit={habit} days={week(0)} />)
    expect(screen.getByRole('button', { name: 'habits.detail.askAstra' })).toBeInTheDocument()
    expect(screen.queryByText(/lastSevenDays/)).toBeNull()
  })

  it('renders the review row of the current surface while the flag is off', () => {
    const { container } = render(<><HabitDetailOrbitLine habit={habit} days={week(5)} /><HabitDetailReviewRow habit={habit} /></>)
    expect(screen.getAllByRole('button', { name: 'habits.detail.askAstra' })).toHaveLength(1)
    expect(container.querySelector('[data-today-astra-slot]')).toBeNull()
  })
})
