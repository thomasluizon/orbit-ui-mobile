import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildSearchMatchLines } from '@orbit/shared/utils'
import { render } from '@testing-library/react'
import { HabitMatchLine } from '@/components/search/habit-match-line'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('typed search match', () => {
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('retains the full match for %s', async (name) => {
    const habit = createMockHabit({ searchMatches: [{ field: 'tag', value: name }] })
    const match = buildSearchMatchLines('Read', habit, (key) => key)[0]!
    const { container } = render(<HabitMatchLine habit={habit} query="Read" />)
    const title = container.querySelector('[data-personal-text]')!
    expect(title).toHaveAttribute('aria-label', match.fragment!)
    expect(title).toHaveStyle({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal' })
  })
})
