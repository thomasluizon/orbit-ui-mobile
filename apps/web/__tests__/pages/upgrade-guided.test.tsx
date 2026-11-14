import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'

const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'pt-BR',
  search: '',
  push: vi.fn(),
  goBack: vi.fn(),
  checkout: vi.fn(),
  beforeRedirect: undefined as (() => Promise<void>) | undefined,
  refetchPlans: vi.fn(),
  status: null as SubscriptionStatus | null,
  timeZone: 'America/Sao_Paulo' as string | null,
  plans: null as Record<string, unknown> | null,
  plansLoading: false,
  plansError: false,
  online: true,
  checkoutLoading: null as 'monthly' | 'yearly' | null,
  purchaseConfirmed: false,
  toastOnSuccess: undefined as boolean | undefined,
  reducedMotion: false,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/upgrade',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: () => actual.createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
    useLocale: () => mocks.locale,
  }
})
vi.mock('@/components/shell/shell-header', () => ({ ShellHeader: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/use-document-title', () => ({ useDocumentTitle: () => {} }))
vi.mock('@/hooks/use-back-label', () => ({ useBackLabel: () => 'Back' }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: vi.fn(), showPersistentError: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: mocks.timeZone } }) }))
vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({ status: mocks.status, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({ plans: mocks.plans, isLoading: mocks.plansLoading, isError: mocks.plansError, refetch: mocks.refetchPlans, discountedAmount: (amount: number) => amount }),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ billing: null, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-stripe-checkout', () => ({
  useStripeCheckout: (beforeRedirect?: () => Promise<void>) => {
    mocks.beforeRedirect = beforeRedirect
    return { checkout: mocks.checkout, checkoutLoading: mocks.checkoutLoading, checkoutError: '' }
  },
}))
vi.mock('@/hooks/use-stripe-checkout-return', () => ({
  useStripeCheckoutReturn: (options?: { toastOnSuccess?: boolean }) => {
    mocks.toastOnSuccess = options?.toastOnSuccess
    return { hasReturnError: false, isSettling: false, purchaseConfirmed: mocks.purchaseConfirmed, retryReturn: vi.fn() }
  },
}))
vi.mock('@/lib/actions/subscription', () => ({ openCustomerPortal: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({ useHeldAccountId: () => 'account-1', getHeldAccountId: () => 'account-1' }))
vi.mock('@/hooks/use-viewport-match', () => ({
  useViewportMatch: (query: string) => query.includes('prefers-reduced-motion') ? mocks.reducedMotion : false,
}))

import UpgradePage from '@/app/(app)/upgrade/page'

const freeStatus: SubscriptionStatus = {
  plan: 'free', hasProAccess: false, isTrialActive: false, trialEndsAt: null, planExpiresAt: null,
  aiMessagesUsed: 3, aiMessagesLimit: 5, aiMessagesPeriod: 'day', isLifetimePro: false,
  subscriptionInterval: null, source: null, lapseReason: null, subscriptionEndedAtUtc: null,
}
const proStatus: SubscriptionStatus = {
  ...freeStatus, plan: 'pro', hasProAccess: true, planExpiresAt: '2026-10-01T01:30:00Z', aiMessagesLimit: 250,
  aiMessagesPeriod: 'week', subscriptionInterval: 'yearly', source: 'stripe',
}
const plans = {
  monthly: { unitAmount: 1990 }, yearly: { unitAmount: 11880 }, currency: 'brl', savingsPercent: 50, couponPercentOff: null,
}

function block() {
  return document.querySelector<HTMLElement>('[data-upgrade-block]')!
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.sessionStorage.clear()
  Object.assign(mocks, {
    locale: 'en', search: '', status: freeStatus, timeZone: 'America/Sao_Paulo', plans, plansLoading: false, plansError: false,
    online: true, checkoutLoading: null, purchaseConfirmed: false, reducedMotion: false,
  })
  enableTestFlags('orbit_guided_flows')
})

describe('the plan question of the upgrade route', () => {
  it.each([
    ['en', 'Which plan?', 'You used 3 of 5 AI messages.'],
    ['pt-BR', 'Qual plano?', 'Você usou 3 de 5 mensagens de IA.'],
  ] as const)('shows Orbit in Parado, the usage line, the question as the one h1 and two plan options in %s', (locale, question, line) => {
    mocks.locale = locale
    render(<UpgradePage />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(question)
    expect(headings[0]).toHaveAccessibleDescription(line)
    expect(block().querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(within(block()).getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(block().querySelectorAll('[data-option-card]')).toHaveLength(2)
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it('follows the usage read when it changes', () => {
    const { rerender } = render(<UpgradePage />)
    expect(screen.getByText('You used 3 of 5 AI messages.')).toBeInTheDocument()
    mocks.status = { ...freeStatus, aiMessagesUsed: 5 }
    rerender(<UpgradePage />)
    expect(screen.getByText('You used 5 of 5 AI messages.')).toBeInTheDocument()
    expect(block().querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('selects the pressed plan and starts the handoff for that plan only', () => {
    render(<UpgradePage />)
    const monthly = block().querySelector<HTMLElement>('[data-tier="monthly"]')!
    const yearly = block().querySelector<HTMLElement>('[data-tier="yearly"]')!
    expect(yearly).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(monthly)
    expect(monthly).toHaveAttribute('aria-pressed', 'true')
    expect(monthly).toHaveAttribute('data-selected')
    expect(yearly).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Monthly' }))
    expect(mocks.checkout).toHaveBeenCalledTimes(1)
    expect(mocks.checkout).toHaveBeenCalledWith('monthly')
  })

  it('shows the price of each plan from the plans read, and the interval control selects the plan', () => {
    render(<UpgradePage />)
    expect(block().querySelector('[data-tier="yearly"]')).toHaveTextContent('brl 118.80')
    expect(block().querySelector('[data-tier="yearly"]')).toHaveTextContent('That is brl 9.90 a month, 50% less than monthly.')
    expect(block().querySelector('[data-tier="monthly"]')).toHaveTextContent('brl 19.90')
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }))
    expect(block().querySelector('[data-tier="monthly"]')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Monthly' }))
    expect(mocks.checkout).toHaveBeenCalledWith('monthly')
  })

  it('shows the coupon line on the plan cards when the plans read carries a coupon', () => {
    mocks.plans = { ...plans, couponPercentOff: 20 }
    render(<UpgradePage />)
    expect(block().querySelector('[data-tier="yearly"]')).toHaveTextContent('With your coupon, 20% off the first charge.')
    expect(block().querySelector('[data-tier="monthly"]')).toHaveTextContent('With your coupon, 20% off the first charge.')
  })

  it('keeps the allowance comparison, the plan fact, the Pro list, the notes and the stay free action', () => {
    render(<UpgradePage />)
    const allowance = screen.getByRole('region', { name: 'AI allowance' })
    expect(allowance).toHaveTextContent('5')
    expect(allowance).toHaveTextContent('messages/day')
    expect(allowance).toHaveTextContent('250')
    expect(allowance).toHaveTextContent('messages/week')
    expect(screen.getByText('You are on the free plan')).toBeInTheDocument()
    expect(screen.getByText('No lock-in, and no card is ever stored in Orbit.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Included with Pro' }).querySelectorAll('li')).toHaveLength(4)
    expect(screen.getByText('Cancel whenever you like.')).toBeInTheDocument()
    expect(screen.getByText(en.upgrade.plans.renewalNote)).toBeInTheDocument()
    expect(screen.getByText(en.upgrade.convert.handOff)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Stay on the free plan' }))
    expect(mocks.goBack).toHaveBeenCalledWith('/profile')
  })

  it('shows the trial line with the days left, and the last day variant on the last day', () => {
    mocks.status = { ...freeStatus, plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2026-09-15T12:00:00Z' }
    vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
    const { unmount } = render(<UpgradePage />)
    expect(screen.getByText(/trial days left/)).toBeInTheDocument()
    unmount()
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'))
    render(<UpgradePage />)
    expect(screen.getByText('Last day of the trial')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('names the loading state and shows a skeleton, with no plan to start', () => {
    mocks.plans = null
    mocks.plansLoading = true
    render(<UpgradePage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('I am fetching the amounts.')
    expect(document.querySelector('[data-plan-options="loading"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Subscribe/ })).toBeDisabled()
  })

  it('names the plans error and reads the plans again on retry', () => {
    mocks.plans = null
    mocks.plansError = true
    render(<UpgradePage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('I could not fetch the amounts.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetchPlans).toHaveBeenCalledTimes(1)
  })

  it('refuses the handoff offline with a visible reason', () => {
    mocks.online = false
    render(<UpgradePage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('I am offline right now.')
    expect(document.querySelector('[data-upgrade-offline-reason]')).toHaveTextContent(en.upgrade.billing.offline)
    const subscribe = screen.getByRole('button', { name: /Subscribe/ })
    expect(subscribe).toBeDisabled()
    fireEvent.click(subscribe)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })

  it('keeps one handoff while a checkout waits', () => {
    mocks.checkoutLoading = 'yearly'
    render(<UpgradePage />)
    const subscribe = screen.getByRole('button', { name: /Subscribe/ })
    expect(subscribe).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(subscribe)
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(block().querySelector('[data-tier="monthly"]')).toBeDisabled()
  })

  it('moves focus between the plan options with the arrow keys and does not select', () => {
    render(<UpgradePage />)
    const yearly = block().querySelector<HTMLElement>('[data-tier="yearly"]')!
    const monthly = block().querySelector<HTMLElement>('[data-tier="monthly"]')!
    yearly.focus()
    fireEvent.keyDown(yearly, { key: 'ArrowDown' })
    expect(monthly).toHaveFocus()
    expect(monthly).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([[false, 160], [true, 0]] as const)('settles the selection with reduced motion %s in %i ms', (reducedMotion, duration) => {
    mocks.reducedMotion = reducedMotion
    render(<UpgradePage />)
    const monthly = block().querySelector<HTMLElement>('[data-tier="monthly"]')!
    expect(monthly).toHaveAttribute('data-selection-duration', String(duration))
    expect(monthly.style.transitionDuration).toBe(`${duration}ms`)
  })
})

describe('the result of a purchase', () => {
  it('opens no dialog for a return that the subscription read does not confirm', () => {
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which plan?')
  })

  it('opens no dialog when the read reports Pro and no purchase was confirmed', () => {
    mocks.status = proStatus
    render(<UpgradePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('states the renewal date of the record in the account time zone and opens Hoje', () => {
    mocks.status = proStatus
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    const dialog = screen.getByRole('dialog', { name: 'Done!' })
    expect(dialog).toHaveAccessibleDescription('Pro is active and renews on September 30, 2026.')
    expect(mocks.toastOnSuccess).toBe(false)
    expect(document.querySelectorAll('[data-result-dialog] button')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Today' }))
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('states the end date for a subscription that does not renew, in pt-BR', () => {
    mocks.locale = 'pt-BR'
    mocks.status = { ...proStatus, lapseReason: 'canceled' }
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    expect(screen.getByRole('dialog', { name: 'Pronto!' })).toHaveAccessibleDescription('O Pro está ativo até 30 de setembro de 2026.')
  })

  it('returns the person to the place that the from of the visit names', () => {
    mocks.search = 'from=/profile/ai'
    mocks.status = proStatus
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile/ai')
  })

  it('keeps the from of the visit across the Stripe redirect', async () => {
    mocks.search = 'from=/profile/ai'
    const { unmount } = render(<UpgradePage />)
    await mocks.beforeRedirect?.()
    unmount()
    mocks.search = 'subscription=success'
    mocks.status = proStatus
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back' }))
    expect(mocks.push).toHaveBeenCalledWith('/profile/ai')
  })

  it('closes on dismissal and stays on the subscription route', () => {
    mocks.status = proStatus
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
