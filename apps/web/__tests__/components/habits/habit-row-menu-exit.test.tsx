import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))

afterEach(cleanup)

describe('HabitRow menu exit', () => {
  it.each(['open', 'exiting'])('replaces the first %s menu on a second row pointer press', async (phase) => {
    render(
      <div onPointerDown={(event) => event.stopPropagation()}>
        <HabitRow habit={createMockHabit({ id: 'a', title: 'Meditate' })} actions={{ onEdit: vi.fn() }} />
        <HabitRow habit={createMockHabit({ id: 'b', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
      </div>,
    )
    const [first, second] = screen.getAllByRole('button', { name: 'habits.actions.more' })
    fireEvent.pointerDown(first!)
    fireEvent.click(first!)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    if (phase === 'exiting') {
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    }
    fireEvent.pointerDown(second!)
    fireEvent.click(second!)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'habits.deleteHabit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, resolveMotionPreset('menu', false).exitDuration + 32))
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'habits.deleteHabit' })).toBeInTheDocument()
  })
})
