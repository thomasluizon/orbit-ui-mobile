import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { AccountRowsCard } from '@/components/chat/account-rows-card'

const mocks = vi.hoisted(() => ({ push: vi.fn(), writeText: vi.fn(), share: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ title, body, actions }: BlockFrameProps) => <section><h2>{title}</h2>{body}{actions}</section> }))

describe('Astra account rows on web', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share })
    mocks.writeText.mockResolvedValue(undefined)
    mocks.share.mockResolvedValue(undefined)
  })

  it('keeps plan rows read only and drops unknown keys', () => {
    render(<AccountRowsCard accountRows={{ kind: 'plan', surfaceId: 'profile', rows: [
      { key: 'plan', value: 'Pro', valueType: 'enum' },
      { key: 'trialEnd', value: '2026-09-26T12:00:00Z', valueType: 'date' },
      { key: 'lifetime', value: 'true', valueType: 'boolean' },
      { key: 'unknownKey', value: 'hidden', valueType: 'text' },
    ] }} />)
    expect(screen.getByText('chat.account.value.plan.Pro')).toBeInTheDocument()
    expect(screen.getByText('chat.account.yes')).toBeInTheDocument()
    expect(screen.getByText(/set\./)).toBeInTheDocument()
    expect(screen.queryByText('hidden')).not.toBeInTheDocument()
    expect(screen.queryByText(/upgrade\./)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.account.open' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile')
  })

  it('copies the referral code and shares its link without a destination chip', async () => {
    render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralCode: 'ORBIT123', referralLink: 'https://example.com/r/ORBIT123' }} />)
    expect(screen.getByText('ORBIT123')).not.toHaveClass('truncate')
    expect(screen.getByText('ORBIT123')).toHaveAttribute('translate', 'no')
    fireEvent.click(screen.getByRole('button', { name: 'chat.account.copy' }))
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('ORBIT123'))
    expect(await screen.findByRole('status')).toHaveTextContent('chat.account.copied')
    expect(screen.getByRole('button', { name: 'chat.account.copied' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.account.share' }))
    await waitFor(() => expect(mocks.share).toHaveBeenCalledWith({ title: 'referral.share.title', url: 'https://example.com/r/ORBIT123' }))
    expect(screen.queryByRole('button', { name: 'chat.account.open' })).not.toBeInTheDocument()
  })

  it('offers link copy when browser sharing is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralLink: 'https://example.com/r/ORBIT123' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.copyLink' }))
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('https://example.com/r/ORBIT123'))
  })
})
