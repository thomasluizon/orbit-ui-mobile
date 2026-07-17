import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { PublicProfileView as PublicProfileViewData } from '@orbit/shared/types/public-profile'
import type { PublicProfileTranslator } from '@/components/profile/public-profile-view'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/components/ui/app-logo', () => ({ AppLogo: () => <span data-testid="logo" /> }))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ value, label }: { value: React.ReactNode; label: string }) => (
    <div data-testid="stat">{value}<span>{label}</span></div>
  ),
}))

import { PublicProfileView } from '@/components/profile/public-profile-view'

function makeView(overrides: Partial<PublicProfileViewData> = {}): PublicProfileViewData {
  return {
    displayName: 'Ada Lovelace',
    handle: 'ada',
    language: 'en',
    currentStreak: 12,
    longestStreak: 40,
    level: 4,
    levelTitle: 'Navigator',
    achievements: [],
    topHabits: [],
    ...overrides,
  }
}

function makeTranslator(knownKeys: Set<string> = new Set()): PublicProfileTranslator {
  const translate = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}(${JSON.stringify(values)})` : key
  const translator = translate as PublicProfileTranslator
  translator.has = (key: string) => knownKeys.has(key)
  return translator
}

describe('PublicProfileView', () => {
  it('derives the avatar initial and shows the handle', () => {
    render(<PublicProfileView view={makeView()} t={makeTranslator()} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('@ada')).toBeInTheDocument()
  })

  it('falls back to the O initial when the display name is blank', () => {
    render(<PublicProfileView view={makeView({ displayName: '  ' })} t={makeTranslator()} />)
    expect(screen.getByText('O')).toBeInTheDocument()
  })

  it('renders streak and level tiles plus the longest-streak line when present', () => {
    render(<PublicProfileView view={makeView()} t={makeTranslator()} />)
    expect(screen.getAllByTestId('stat')).toHaveLength(2)
    expect(screen.getByText(/longestStreakLabel/)).toBeInTheDocument()
  })

  it('omits the stats block entirely when there is no streak or level', () => {
    render(
      <PublicProfileView
        view={makeView({ currentStreak: null, level: null, longestStreak: null })}
        t={makeTranslator()}
      />,
    )
    expect(screen.queryByTestId('stat')).not.toBeInTheDocument()
  })

  it('localizes known achievements and falls back to the raw name for unknown keys', () => {
    const view = makeView({
      achievements: [
        { iconKey: 'first_habit', name: 'First Steps', rarity: 'Common' },
        { iconKey: 'mystery', name: 'Mystery Badge', rarity: 'Rare' },
      ],
    })
    const t = makeTranslator(new Set(['gamification.achievements.first_habit.name']))
    render(<PublicProfileView view={view} t={t} />)
    expect(screen.getByText('gamification.achievements.first_habit.name')).toBeInTheDocument()
    expect(screen.getByText('Mystery Badge')).toBeInTheDocument()
  })

  it('lists top habits when the API returned them', () => {
    render(<PublicProfileView view={makeView({ topHabits: ['Reading', 'Running'] })} t={makeTranslator()} />)
    expect(screen.getByText('Reading')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
