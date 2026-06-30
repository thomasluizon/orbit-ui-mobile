import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const serverPublicFetch = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/server-fetch', () => ({
  serverPublicFetch: (...args: unknown[]) => serverPublicFetch(...args),
}))

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
}))

vi.mock('@/components/profile/public-profile-view', () => ({
  PublicProfileView: ({
    view,
  }: {
    view: { displayName: string; currentStreak: number | null; achievements: unknown }
  }) => (
    <div>
      <span data-testid="name">{view.displayName}</span>
      <span data-testid="streak">{view.currentStreak ?? 'none'}</span>
      <span data-testid="achievements">{view.achievements ? 'has' : 'none'}</span>
    </div>
  ),
}))

import PublicProfileSlugPage, { generateMetadata } from '@/app/(public)/u/[slug]/page'

const fullView = {
  displayName: 'Ana Clara',
  handle: 'ana_clara',
  language: 'en',
  currentStreak: 7,
  longestStreak: 30,
  level: 5,
  levelTitle: 'Pilot',
  achievements: [{ name: 'First Orbit', iconKey: 'first_orbit', rarity: 'Common' }],
  topHabits: null,
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

describe('public profile slug page', () => {
  beforeEach(() => {
    serverPublicFetch.mockReset()
    notFound.mockClear()
  })

  it('renders the fields the API returned', async () => {
    serverPublicFetch.mockResolvedValue(fullView)
    const ui = await PublicProfileSlugPage(params('ABC'))
    render(ui)
    expect(screen.getByTestId('name')).toHaveTextContent('Ana Clara')
    expect(screen.getByTestId('streak')).toHaveTextContent('7')
    expect(screen.getByTestId('achievements')).toHaveTextContent('has')
  })

  it('omits fields the API left null', async () => {
    serverPublicFetch.mockResolvedValue({ ...fullView, currentStreak: null, longestStreak: null, achievements: null })
    const ui = await PublicProfileSlugPage(params('ABC'))
    render(ui)
    expect(screen.getByTestId('streak')).toHaveTextContent('none')
    expect(screen.getByTestId('achievements')).toHaveTextContent('none')
  })

  it('calls notFound when the slug is unknown', async () => {
    serverPublicFetch.mockResolvedValue(null)
    await expect(PublicProfileSlugPage(params('missing'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('generateMetadata returns the static branded OG tags', async () => {
    serverPublicFetch.mockResolvedValue(fullView)
    const meta = await generateMetadata(params('ABC'))

    const ogImages = meta.openGraph?.images as Array<{ url: string }>
    expect(ogImages[0]?.url).toBe('/og-profile.png')
    expect((meta.twitter as { card?: string }).card).toBe('summary_large_image')
    expect(meta.title).toBeTruthy()
  })
})
