import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const cases = (['sheet', 'anchored'] as const).flatMap((presentation) =>
  (['open', 'dismissed', 'reopened'] as const).flatMap((phase) =>
    (['pointer', 'click-only'] as const).map((activation) => ({ presentation, phase, activation }))))

describe('HabitRow menu replacement', () => {
  it.each(cases)('replaces the $phase $presentation menu via $activation', async ({ presentation, phase, activation }) => {
    vi.stubGlobal('matchMedia', () => ({ matches: presentation === 'anchored', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<>
      <HabitRow habit={createMockHabit({ id: 'a', title: 'Read' })} actions={{ onEdit: vi.fn() }} />
      <HabitRow habit={createMockHabit({ id: 'b', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
    </>)
    const [first, second] = screen.getAllByRole('button', { name: 'habits.actions.more' })
    const press = (trigger: HTMLElement) => {
      if (activation === 'pointer') fireEvent.pointerDown(trigger)
      fireEvent.click(trigger)
    }
    press(first!)
    await screen.findByRole('menuitem', { name: 'common.edit' })
    if (phase !== 'open') {
      fireEvent.keyDown(document, { key: 'Escape' })
      if (phase === 'reopened') {
        press(first!)
        await screen.findByRole('menuitem', { name: 'common.edit' })
      }
    }
    press(second!)
    await screen.findByRole('menuitem', { name: 'habits.actions.delete' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(first).toHaveAttribute('aria-expanded', 'false')
    if (presentation === 'anchored') {
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'habits.actions.delete' })).toHaveFocus())
    }
  })
})
