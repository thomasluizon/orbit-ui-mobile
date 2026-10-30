import { measureClampedPersonalText } from '@/__tests__/support/personal-text'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { fireEvent, render, screen } from '@testing-library/react'
import { HabitDrill } from '@/components/habits/habit-list/habit-drill'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { name: string }) => key === 'common.showFullText' ? `Show full text: ${values!.name}` : key }))

afterEach(() => vi.restoreAllMocks())

describe('typed drill heading', () => {
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses %s and preserves the back action', async (name) => {
    measureClampedPersonalText()
    const drillBack = vi.fn()
    const drill = {
      drillStack: ['habit-1'], currentParentId: 'habit-1', currentParent: createMockHabit({ title: name }),
      drillChildren: [], hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
      drillLoading: false, drillError: '', drillInto: vi.fn(async () => {}), drillBack, drillReset: vi.fn(),
      refreshCurrent: vi.fn(async () => {}), getDrillChildren: () => [],
    }
    render(<HabitDrill drill={drill} t={(key) => key} renderHabitCard={() => null} onAddSubHabit={vi.fn()} />)
    const title = screen.getByRole('heading', { name, level: 2 }).querySelector('[data-personal-text]')!
    expect(title).toHaveAttribute('aria-label', name)
    expect(title).toHaveStyle({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal' })
    fireEvent.click(screen.getByRole('button', { name: `Show full text: ${name}`, expanded: false }))
    const dialog = await screen.findByRole('dialog', { name })
    expect(dialog.querySelector('[data-personal-text-expanded]')).toHaveTextContent(name)
    expect(drillBack).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    expect(drillBack).toHaveBeenCalledOnce()
  })
})
