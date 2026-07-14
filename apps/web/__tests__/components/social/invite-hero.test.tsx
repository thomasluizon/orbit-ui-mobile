import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ referralUrl: 'https://useorbit.org/r/ABC123' as string | null }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({ referralUrl: mocks.referralUrl }),
}))

vi.mock('@/components/share/share-card-qr', () => ({
  ShareCardQr: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}))

import { InviteHero } from '@/app/(app)/social/_components/invite-hero'

interface NavigatorOverrides {
  clipboard?: { writeText: (text: string) => Promise<void> }
  share?: (payload: unknown) => Promise<void>
}

function setNavigator(overrides: NavigatorOverrides) {
  const target = navigator as unknown as NavigatorOverrides
  Object.defineProperty(target, 'clipboard', { value: overrides.clipboard, configurable: true })
  Object.defineProperty(target, 'share', { value: overrides.share, configurable: true })
}

describe('InviteHero', () => {
  beforeEach(() => {
    mocks.referralUrl = 'https://useorbit.org/r/ABC123'
  })

  afterEach(() => {
    const target = navigator as unknown as NavigatorOverrides
    Object.defineProperty(target, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(target, 'share', { value: undefined, configurable: true })
  })

  it('renders nothing until a referral link exists', () => {
    mocks.referralUrl = null
    const { container } = render(<InviteHero />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the link, QR, and share button when native share is available', () => {
    setNavigator({ clipboard: { writeText: vi.fn() }, share: vi.fn() })
    render(<InviteHero />)
    expect(screen.getByTestId('qr')).toHaveTextContent('https://useorbit.org/r/ABC123')
    expect(screen.getByRole('button', { name: 'social.invite.share' })).toBeInTheDocument()
  })

  it('omits the share button where the Web Share API is unavailable', () => {
    setNavigator({ clipboard: { writeText: vi.fn() } })
    render(<InviteHero />)
    expect(screen.queryByRole('button', { name: 'social.invite.share' })).not.toBeInTheDocument()
  })

  it('copies the link and flips the affordance to the copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } })
    render(<InviteHero />)
    fireEvent.click(screen.getByRole('button', { name: 'social.invite.copy' }))
    expect(writeText).toHaveBeenCalledWith('https://useorbit.org/r/ABC123')
    await screen.findByRole('button', { name: 'social.invite.copied' })
  })

  it('stays in the idle state when the clipboard write is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setNavigator({ clipboard: { writeText } })
    render(<InviteHero />)
    fireEvent.click(screen.getByRole('button', { name: 'social.invite.copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'social.invite.copy' })).toBeInTheDocument()
  })

  it('invokes native share with the referral payload', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText: vi.fn() }, share })
    render(<InviteHero />)
    fireEvent.click(screen.getByRole('button', { name: 'social.invite.share' }))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://useorbit.org/r/ABC123' }),
      ),
    )
  })
})
