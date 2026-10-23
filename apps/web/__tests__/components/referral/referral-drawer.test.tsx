import { referralCopyCases } from '@orbit/shared/__tests__/referral-copy-fixtures'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const translationState = vi.hoisted(() => ({ locale: '' }))
vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    if (translationState.locale) return (() => { const translate = actual.createTranslator({ locale: translationState.locale, messages: translationState.locale === 'en' ? en : ptBR }); return translate(key as Parameters<typeof translate>[0], params) })()
    return params ? `${key}:${JSON.stringify(params)}` : key
  } }
})

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

let mockStats: { successfulReferrals: number; maxReferrals: number; pendingReferrals: number; discountPercent: number; rewardType?: string; proDaysPerReferral?: number } | null = null
const mockReferralUrl = 'https://app.useorbit.org/ref/abc123'
let mockIsLoading = false
let mockIsError = false
let mockError: { message: string } | null = null

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({
    stats: mockStats,
    referralUrl: mockReferralUrl,
    isLoading: mockIsLoading,
    isError: mockIsError,
    error: mockError,
  }),
}))

import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { expectSmallSheetActions, sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

describe('ReferralDrawer', () => {
  beforeEach(() => {
    translationState.locale = ''
    document.body.innerHTML = ''
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    mockStats = null
    mockIsLoading = false
    mockIsError = false
    mockError = null
  })

  it.each(['en', 'pt-BR'])('describes the real Pro-days offer and shares it in %s', (locale) => {
    translationState.locale = locale
    mockStats = { successfulReferrals: 8, maxReferrals: 10, pendingReferrals: 2, rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<ReferralDrawer open onOpenChange={vi.fn()} />)
    const explanation = locale === 'en'
      ? 'Invite someone to create an account with your link. If they log habits on three different days in their first week, you can earn 7 days of Pro.'
      : 'Convide alguém a criar uma conta pelo seu link. Se a pessoa registrar hábitos em três dias diferentes na primeira semana, você pode ganhar 7 dias de Pro.'
    expect(screen.getByText(explanation)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('23%')
    expect(document.body.textContent).not.toMatch(/Coupons earned|Cupons ganhos|56/)
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Share link' : ptBR.referral.drawer.share }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(locale === 'en' ? 'I can earn 7 days of Pro.' : 'Eu posso ganhar 7 dias de Pro.'), url: mockReferralUrl }))
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <ReferralDrawer open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it.each([
    'referral.drawer.title',
    'referral.drawer.yourLink',
  ])('renders %s when open', (text) => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockIsLoading = true
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(
      screen.getByRole('status', { name: 'common.loading' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(mockReferralUrl)
  })

  it('shows error state', () => {
    mockIsError = true
    mockError = { message: 'Failed to load' }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows referral URL when loaded', () => {
    mockIsLoading = false
    mockIsError = false
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(document.body.textContent).toContain('https://app.useorbit.org/ref/abc123')
  })

  it('shows an icon-only copy button with an accessible label', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'referral.drawer.copyLink' }),
    ).toBeInTheDocument()
  })

  it('shows stats when available', () => {
    mockStats = {
      successfulReferrals: 3,
      maxReferrals: 10,
      pendingReferrals: 2,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.completed')).toBeInTheDocument()
    expect(document.body.textContent).toContain('3 / 10')
  })

  it('shows pending referrals when > 0', () => {
    mockStats = {
      successfulReferrals: 1,
      maxReferrals: 10,
      pendingReferrals: 2,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.pending')).toBeInTheDocument()
    expect(document.body.textContent).toContain('2')
  })

  it('keeps completions without claiming they are reward grants', () => {
    mockStats = {
      successfulReferrals: 3,
      maxReferrals: 10,
      pendingReferrals: 0,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.queryByText('referral.drawer.couponsEarned')).not.toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('shows disclaimer', () => {
    mockStats = {
      successfulReferrals: 0,
      maxReferrals: 10,
      pendingReferrals: 0,
      discountPercent: 15,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(document.body.textContent).toContain('referral.reward.eligibility')
    expect(document.body.textContent).toContain('referral.reward.neutral')
    expect(document.body.textContent).not.toContain('15%')
  })

  it('shows feedback when the native share operation rejects', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('No share target', 'AbortError'))
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    })

    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.share' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('referral.drawer.actionFailed')
    expect(share).toHaveBeenCalledWith({
      title: 'referral.share.title',
      text: 'referral.share.neutral:{}',
      url: mockReferralUrl,
    })
  })

  it('shows a failed share in the pinned footer, beside Share', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new Error('share failed')) })
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.share' }))

    expect((await screen.findByRole('alert')).closest('[data-slot="sheet-actions"]')).not.toBeNull()
  })

  it('shows a failed copy in the body, beside the link', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.copyLink' }))

    expect((await screen.findByRole('alert')).closest('[data-slot="sheet-body"]')).not.toBeNull()
  })

  it('pins Share in the sheet footer and keeps only the copy control in the body', () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)

    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'referral.drawer.share'])
    expectSmallSheetActions()
    expect(sheetActionsUseActionPair()).toBe(true)
    expect(sheetSlotButtons('sheet-body')).toEqual(['referral.drawer.copyLink'])
  })

  it('cancels through the sheet host without sharing', () => {
    const share = vi.fn()
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    const onOpenChange = vi.fn()
    render(<ReferralDrawer open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(share).not.toHaveBeenCalled()
  })

  it.each([
    ['loading', () => { mockIsLoading = true }],
    ['failed', () => { mockIsError = true; mockError = { message: 'unavailable' } }],
  ])('offers no Share while the referral is %s', (_state, arrange) => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    arrange()
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)

    expect(document.querySelector('[data-slot="sheet-actions"]')).toBeNull()
  })

  it('does not invent discount copy before stats load', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(document.body.textContent).not.toContain('referral.drawer.howItWorks')
    expect(document.body.textContent).not.toContain('referral.reward.eligibility')
  })
  it.each(referralCopyCases)('shows exact $locale reward prose and shares its matching offer', ({ locale, stats, invitation, explanation }) => {
    translationState.locale = locale
    mockStats = { successfulReferrals: 8, maxReferrals: 10, pendingReferrals: 2, ...stats }
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<ReferralDrawer open onOpenChange={vi.fn()} />)
    expect(screen.getByText(explanation)).toBeInTheDocument()
    expect(screen.getByText((locale === 'en' ? en : ptBR).referral.reward.eligibility)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: (locale === 'en' ? en : ptBR).referral.drawer.share }))
    expect(share).toHaveBeenLastCalledWith({ title: (locale === 'en' ? en : ptBR).referral.share.title, text: invitation, url: mockReferralUrl })
  })

  it.each([undefined, 'future_reward', 'pro_days'])('keeps a loaded unknown or incomplete reward nonnumeric, kind %s', (rewardType) => {
    translationState.locale = 'en'
    mockStats = { successfulReferrals: 8, maxReferrals: 10, pendingReferrals: 2, rewardType, discountPercent: 23 }
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<ReferralDrawer open onOpenChange={vi.fn()} />)
    expect(screen.getByText('Share your link to invite someone to Orbit.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/23%|Coupons earned/)
    fireEvent.click(screen.getByRole('button', { name: en.referral.drawer.share }))
    expect(share).toHaveBeenLastCalledWith({ title: en.referral.share.title, text: 'Join me on Orbit.', url: mockReferralUrl })
  })

})
