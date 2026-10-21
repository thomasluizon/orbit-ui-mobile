import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { AccountRowsCard } from '@/components/chat/account-rows-card'

const rewardState = vi.hoisted(() => ({ stats: { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }, locale: '' }))
const referralRead = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => { referralRead(); return { stats: rewardState.stats } } }))
const mocks = vi.hoisted(() => ({ push: vi.fn(), writeText: vi.fn(), share: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return { ...actual, useLocale: () => rewardState.locale || 'pt-BR', useTranslations: () => (key: string, params?: Record<string, string | number>) => rewardState.locale ? (() => { const translate = actual.createTranslator({ locale: rewardState.locale, messages: rewardState.locale === 'en' ? en : ptBR }); return translate(key as Parameters<typeof translate>[0], params) })() : key }
})
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ title, body, actions }: BlockFrameProps) => <section><h2>{title}</h2>{body}{actions}</section> }))

describe('Astra account rows on web', () => {
  beforeEach(() => {
    vi.clearAllMocks(); rewardState.locale = ''
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

  it('discloses complete account values without navigating', () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    const name = 'Ler palavraMuitoLonga todos os dias'
    const { container } = render(<AccountRowsCard accountRows={{ kind: 'profile', surfaceId: 'profile', rows: [
      { key: 'name', value: name, valueType: 'text' },
      { key: 'email', value: email, valueType: 'text' },
    ] }} />)
    for (const value of [name, email]) {
      const disclosure = screen.getByRole('button', { name: new RegExp(value) })
      expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      const text = container.querySelector(`[data-personal-text][aria-label="${value}"]`)
      expect(text).toBeInTheDocument()
      fireEvent.click(disclosure)
      expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      expect(container.querySelector(`[data-personal-text-expanded][aria-label="${value}"]`)).toBeInTheDocument()
    }
    expect(mocks.push).not.toHaveBeenCalled()
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
    await waitFor(() => expect(mocks.share).toHaveBeenCalledWith({ title: 'referral.share.title', text: 'referral.share.proDays', url: 'https://example.com/r/ORBIT123' }))
    expect(screen.queryByRole('button', { name: 'chat.account.open' })).not.toBeInTheDocument()
  })

  it('offers link copy when browser sharing is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralLink: 'https://example.com/r/ORBIT123' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.copyLink' }))
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('https://example.com/r/ORBIT123'))
  })
  it.each(['en', 'pt-BR'])('recognizes the actual Pro-days record and hides its unrelated percent in %s', (locale) => {
    rewardState.locale = locale
    render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', referralCode: 'ORBIT123', referralLink: 'https://example.com/r/ORBIT123', rows: [
      { key: 'successfulReferrals', value: '8', valueType: 'count' },
      { key: 'pendingReferrals', value: '2', valueType: 'count' },
      { key: 'maxReferrals', value: '10', valueType: 'count' },
      { key: 'rewardType', value: 'pro_days', valueType: 'enum' },
      { key: 'discountPercent', value: '23', valueType: 'count' },
    ] }} />)
    expect(screen.getByText(locale === 'en' ? 'Days of Pro' : 'Dias de Pro')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('23%')
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? en.chat.account.share : ptBR.chat.account.share }))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(locale === 'en' ? 'I can earn 7 days of Pro.' : 'Eu posso ganhar 7 dias de Pro.'), url: 'https://example.com/r/ORBIT123' }))
  })

  it.each(['profile', 'plan'] as const)('does not read the referral dashboard for a %s record', (kind) => {
    render(<AccountRowsCard accountRows={{ kind, surfaceId: 'profile', rows: [] }} />)
    expect(referralRead).not.toHaveBeenCalled()
  })

})
