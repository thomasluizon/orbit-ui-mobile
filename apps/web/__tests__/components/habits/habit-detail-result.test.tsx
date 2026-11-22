import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor, act } from '@testing-library/react'
import { HabitDetailResultDialog, HabitDetailUnavailable, useHabitDetailResult } from '@/components/habits/habit-detail-result'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string>) => values?.date ? `${key}|${values.date}` : key,
}))

afterEach(cleanup)
const mascotState = () => document.querySelector('svg[data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state')

describe('web habit detail result dialog', () => {
  it('states the new date after an accepted reschedule, with Orbit in Feliz and a way to Hoje', async () => {
    const onSeeToday = vi.fn()
    render(<HabitDetailResultDialog result={{ kind: 'rescheduled', date: 'Nov 20' }} onSeeToday={onSeeToday} onClose={vi.fn()} />)
    const dialog = await screen.findByRole('dialog', { name: 'result.title' })
    expect(dialog).toHaveAccessibleDescription('result.habit.rescheduled|Nov 20')
    expect(mascotState()).toBe('feliz')
    fireEvent.click(screen.getByRole('button', { name: 'result.seeToday' }))
    expect(onSeeToday).toHaveBeenCalledTimes(1)
  })

  it('shows Orbit in Parado after a delete and states the fact', async () => {
    render(<HabitDetailResultDialog result={{ kind: 'deleted' }} onSeeToday={vi.fn()} onClose={vi.fn()} />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleDescription('result.habit.deleted')
    expect(mascotState()).toBe('parado')
  })

  it('closes on Escape and renders nothing without a result', async () => {
    const onClose = vi.fn()
    const { container, rerender } = render(<HabitDetailResultDialog result={{ kind: 'deleted' }} onSeeToday={vi.fn()} onClose={onClose} />)
    await screen.findByRole('dialog')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    rerender(<HabitDetailResultDialog result={null} onSeeToday={vi.fn()} onClose={onClose} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('holds the result with the guided flows on, and a deleted habit leaves to Hoje however its dialog closes', () => {
    const seeToday = vi.fn()
    const on = renderHook(() => useHabitDetailResult(seeToday))
    act(() => on.result.current.rescheduled('20 November'))
    expect(on.result.current.result).toEqual({ kind: 'rescheduled', date: '20 November' })
    act(() => on.result.current.close())
    expect(on.result.current.result).toBeNull()
    expect(seeToday).not.toHaveBeenCalled()
    act(() => on.result.current.deleted())
    expect(on.result.current.result).toEqual({ kind: 'deleted' })
    act(() => on.result.current.close())
    expect(on.result.current.result).toBeNull()
    expect(seeToday).toHaveBeenCalledOnce()
    act(() => on.result.current.rescheduled('21 November'))
    act(() => on.result.current.seeToday())
    expect(on.result.current.result).toBeNull()
    expect(seeToday).toHaveBeenCalledTimes(2)
  })
})
