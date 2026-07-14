import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
const dismissSocialEntry = vi.fn()

const mocks = vi.hoisted(() => ({
  profile: { socialOptIn: true } as Record<string, unknown> | undefined,
  friends: { data: undefined as { incomingRequests: unknown[] } | undefined },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/lib/plural', () => ({
  plural: (value: string) => value,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => mocks.friends,
}))

vi.mock('@/stores/referral-prompt-store', () => ({
  useEngagementPromptStore: (selector: (state: { dismissSocialEntry: () => void }) => unknown) =>
    selector({ dismissSocialEntry }),
}))

import { SocialEntryCard } from '@/components/social/social-entry-card'

describe('SocialEntryCard', () => {
  beforeEach(() => {
    push.mockClear()
    dismissSocialEntry.mockClear()
    mocks.profile = { socialOptIn: true }
    mocks.friends = { data: undefined }
  })

  it('shows the dismissible invitation and routes to the hub when there are no requests', () => {
    render(<SocialEntryCard />)
    expect(screen.getByText('social.today.entryTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByText('social.today.entryTitle'))
    expect(push).toHaveBeenCalledWith('/social')
    fireEvent.click(screen.getByRole('button', { name: 'common.dismiss' }))
    expect(dismissSocialEntry).toHaveBeenCalledTimes(1)
  })

  it('surfaces pending requests, hides the dismiss control, and deep-links to the friends tab', () => {
    mocks.friends = { data: { incomingRequests: [{}, {}] } }
    render(<SocialEntryCard />)
    expect(screen.getByText('social.today.requestsTitle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.dismiss' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('social.today.requestsTitle'))
    expect(push).toHaveBeenCalledWith('/social?tab=friends')
  })

  it('treats a friends query with no incoming requests as the empty invitation', () => {
    mocks.friends = { data: { incomingRequests: [] } }
    render(<SocialEntryCard />)
    expect(screen.getByText('social.today.entrySubtitle')).toBeInTheDocument()
  })
})
