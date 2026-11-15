import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails } from '@orbit/shared/types/subscription'

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
  billing: null as BillingDetails | null,
  plansLoading: false,
  plansError: false,
  online: true,
  checkoutLoading: null as 'monthly' | 'yearly' | null,
  checkoutError: '',
  purchaseConfirmed: false,
  statusError: false,
  refetchStatus: vi.fn(),
  toastOnSuccess: undefined as boolean | undefined,
  reducedMotion: false,
  wide: false,
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
  useSubscriptionStatus: () => ({ status: mocks.status, isLoading: false, isError: mocks.statusError, refetch: mocks.refetchStatus }),
}))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({ plans: mocks.plans, isLoading: mocks.plansLoading, isError: mocks.plansError, refetch: mocks.refetchPlans, discountedAmount: (amount: number) => amount }),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ billing: mocks.billing, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-stripe-checkout', () => ({
  useStripeCheckout: (beforeRedirect?: () => Promise<void>) => {
    mocks.beforeRedirect = beforeRedirect
    return { checkout: mocks.checkout, checkoutLoading: mocks.checkoutLoading, checkoutError: mocks.checkoutError }
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
  useViewportMatch: (query: string) => query.includes('prefers-reduced-motion') ? mocks.reducedMotion : mocks.wide,
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
    locale: 'en', search: '', status: freeStatus, timeZone: 'America/Sao_Paulo', plans, billing: null, plansLoading: false, plansError: false,
    online: true, checkoutLoading: null, checkoutError: '', purchaseConfirmed: false, statusError: false, reducedMotion: false, wide: false,
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

  it.each([[false, '96'], [true, '128']] as const)('draws Orbit at the size of the shell (wide %s: %s)', (wide, size) => {
    mocks.wide = wide
    render(<UpgradePage />)
    expect(block().querySelector('[data-orbit-face="rig"]')).toHaveAttribute('width', size)
    expect(document.querySelectorAll('[data-orbit-face="rig"]')).toHaveLength(1)
  })

  it.each([['en', 'You used 1 of 1 AI message.'], ['pt-BR', 'Você usou 1 de 1 mensagem de IA.']] as const)('writes a limit of one message in the singular in %s', (locale, line) => {
    mocks.locale = locale
    mocks.status = { ...freeStatus, aiMessagesUsed: 1, aiMessagesLimit: 1 }
    render(<UpgradePage />)
    expect(block().querySelector('[data-upgrade-orbit-line]')).toHaveTextContent(line)
  })

  it('pins the primary action to the bottom of the scroller in the compact shell, after the support content', () => {
    render(<UpgradePage />)
    const primary = screen.getByRole('button', { name: 'Subscribe Annual, recommended' })
    const footer = document.querySelector<HTMLElement>('[data-flow-footer]')!
    expect(footer).toContainElement(primary)
    expect(block()).not.toContainElement(primary)
    expect(footer).toHaveClass('sticky', 'bottom-0')
    expect(footer.nextElementSibling).toBeNull()
    expect(screen.getByRole('list', { name: 'Included with Pro' }).compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const card of block().querySelectorAll<HTMLElement>('[data-option-card]')) expect(card.style.scrollMarginBottom).toBe('calc(var(--touch-min) + var(--orbit-space-24))')
  })

  it('keeps the primary action in the block in the wide shell, with no footer', () => {
    mocks.wide = true
    render(<UpgradePage />)
    expect(document.querySelector('[data-flow-footer]')).toBeNull()
    expect(block()).toContainElement(screen.getByRole('button', { name: 'Subscribe Annual, recommended' }))
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

describe('the billing error of the upgrade route', () => {
  it.each([
    ['en', 'I could not load your plan.'],
    ['pt-BR', 'Não consegui carregar seu plano.'],
  ] as const)('names the billing error with Orbit in Parado and reads the subscription again on retry in %s', (locale, line) => {
    mocks.locale = locale
    mocks.statusError = true
    mocks.status = null
    render(<UpgradePage />)
    const state = document.querySelector<HTMLElement>('[data-upgrade-load-failed]')!
    expect(state.querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
    expect(within(state).getByRole('alert')).toHaveTextContent(line)
    expect(document.querySelector('[data-upgrade-block]')).toBeNull()
    fireEvent.click(within(state).getByRole('button', { name: locale === 'en' ? en.upgrade.billing.retry : ptBR.upgrade.billing.retry }))
    expect(mocks.refetchStatus).toHaveBeenCalledTimes(1)
    expect(mocks.refetchPlans).toHaveBeenCalledTimes(1)
  })
})

describe('the result of a purchase', () => {
  it('opens no dialog for a return that the subscription read does not confirm', () => {
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which plan?')
  })

  it('keeps the plan question and the error of a checkout that fails, with no dialog', () => {
    mocks.checkoutError = 'The checkout did not start.'
    render(<UpgradePage />)
    expect(within(block()).getByRole('alert')).toHaveTextContent('The checkout did not start.')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which plan?')
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it.each([
    ['/calendar', 'Go back', '/calendar'],
    ['//elsewhere.example', 'Open Today', '/'],
  ] as const)('returns the person to %s only when it is a place of the app', (from, label, destination) => {
    mocks.search = `from=${encodeURIComponent(from)}`
    mocks.status = proStatus
    mocks.purchaseConfirmed = true
    render(<UpgradePage />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(destination)
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

describe('the dashboards and the notices with the guided flows on', () => {
  const billing: BillingDetails = {
    interval: 'yearly', cancelAtPeriodEnd: false, status: 'active', currentPeriodEnd: '2026-10-01T01:30:00Z', amountPerPeriod: 11880, currency: 'brl',
    paymentMethod: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 },
    recentInvoices: [{ id: 'invoice-1', date: '2026-09-01T12:00:00Z', amountPaid: 11880, currency: 'brl', status: 'paid', hostedInvoiceUrl: null, invoicePdf: 'https://invoices.example/invoice-1.pdf', billingReason: 'subscription_cycle' }],
  }

  it('keeps every read and every provider link of the Stripe dashboard, with the usage of the person and no plan question', () => {
    mocks.status = { ...proStatus, aiMessagesUsed: 40 }
    mocks.billing = billing
    render(<UpgradePage />)
    expect(screen.getByText('Visa ending in 4242')).toBeInTheDocument()
    expect(screen.getByText('Expires 12/2028')).toBeInTheDocument()
    expect(screen.getByText('Renewal')).toBeInTheDocument()
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null)
    fireEvent.click(screen.getByRole('button', { name: /Download the invoice from/ }))
    expect(open).toHaveBeenCalledWith('https://invoices.example/invoice-1.pdf', '_blank', 'noopener,noreferrer')
    expect(screen.getByText('40 of 250')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Open the Stripe portal|Change/ }).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector('[data-upgrade-block]')).toBeNull()
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it('keeps the Google Play note and its provider action', () => {
    mocks.status = { ...proStatus, source: 'play', billingProvider: 'play' }
    render(<UpgradePage />)
    expect(screen.getByText(/You subscribed through Google Play/)).toBeInTheDocument()
    expect(screen.getByText('Open Google Play')).toBeInTheDocument()
    expect(screen.queryByText('Open the Stripe portal')).toBeNull()
  })

  it('keeps the App Store note with no provider action', () => {
    mocks.status = { ...proStatus, source: null, billingProvider: 'app_store' }
    render(<UpgradePage />)
    expect(screen.getByText('To change or cancel this App Store subscription, manage it on your iPhone.')).toBeInTheDocument()
    expect(screen.queryByText('Open the Stripe portal')).toBeNull()
    expect(screen.queryByRole('button', { name: /Subscribe/ })).toBeNull()
  })

  it('opens the plan question from the action of the lapsed notice', () => {
    mocks.status = { ...freeStatus, lapseReason: 'payment_failed', subscriptionEndedAtUtc: '2026-09-01T12:00:00Z' }
    render(<UpgradePage />)
    const notice = document.querySelector<HTMLElement>('[data-subscription-notice]')!
    expect(within(notice).getByRole('heading', { name: 'Your Pro has ended' })).toBeInTheDocument()
    expect(within(notice).getByText('Update your payment method with the provider.')).toBeInTheDocument()
    expect(notice.querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(within(notice).getByRole('button', { name: 'Subscribe again' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which plan?')
    expect(document.querySelector('[data-subscription-notice]')).toBeNull()
  })
})

describe('the upgrade route with the guided flows off', () => {
  it('keeps the current billing error with no Orbit', () => {
    resetTestFlags()
    mocks.statusError = true
    mocks.status = null
    render(<UpgradePage />)
    expect(screen.getByRole('alert')).toHaveTextContent(en.upgrade.billing.error)
    expect(document.querySelector('[data-upgrade-load-failed]')).toBeNull()
    expect(document.querySelector('[data-orbit-face="rig"]')).toBeNull()
  })

  it('keeps the current pitch, the title of the header as a heading and the done toast of the Stripe return', () => {
    resetTestFlags()
    render(<UpgradePage />)
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual(['Orbit Pro'])
    expect(document.querySelector('[data-upgrade-block]')).toBeNull()
    expect(document.querySelector('[data-upgrade-orbit-line]')).toBeNull()
    expect(mocks.toastOnSuccess).toBe(true)
    expect(mocks.beforeRedirect).toBeUndefined()
  })
})
