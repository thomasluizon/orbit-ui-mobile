import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { HabitRow } from '@/components/habits/habit-row'

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
