import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'

const motionMocks = vi.hoisted(() => ({
  reduced: false,
  renderedProps: [] as Record<string, unknown>[],
  presenceProps: [] as Record<string, unknown>[],
}))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  const React = await import('react')
  function MotionDiv(props: Record<string, unknown>) {
    motionMocks.renderedProps.push(props)
    const { animate, children, exit, initial, ref, transition, ...domProps } = props
    void animate
    void exit
    void initial
    void transition
    return React.createElement('div', { ...domProps, ref }, children as React.ReactNode)
  }
  return {
    ...actual,
    AnimatePresence: ({ children, ...props }: { children: React.ReactElement }) => {
      motionMocks.presenceProps.push({ ...props, stateKey: children.key })
      return children
    },
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    m: { div: MotionDiv },
    useReducedMotion: () => motionMocks.reduced,
  }
})

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({}),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as ReturnType<typeof useTranslations>

const plans = {
  monthly: { unitAmount: 999, currency: 'usd' },
  yearly: { unitAmount: 4999, currency: 'usd' },
  savingsPercent: 58,
  couponPercentOff: null,
  currency: 'usd',
}

function renderSelection(overrides: Partial<Parameters<typeof PlanSelection>[0]> = {}) {
  const props = {
    plans,
    isLoading: false,
    isError: false,
    isOnline: true,
    discountedAmount: (amount: number) => amount,
    checkoutLoading: null,
    onCheckout: vi.fn(),
    onRetry: vi.fn(),
    t,
    ...overrides,
  }
  const view = render(<PlanSelection {...props} />)
  return { ...props, ...view }
}

function tierNamed(name: string) {
  return screen.getByRole('heading', { level: 2, name }).closest('section')!
}

describe('PlanSelection', () => {
  const observers: { measure: () => void; disconnect: ReturnType<typeof vi.fn> }[] = []
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('ResizeObserver', class {
      disconnect = vi.fn()
      constructor(measure: () => void) { observers.push({ measure, disconnect: this.disconnect }) }
      observe() {}
    })
    motionMocks.reduced = false
    motionMocks.renderedProps.length = 0
    motionMocks.presenceProps.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('leads with annual and gives the recommended tier the only filled action', () => {
    renderSelection()

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.annual' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'upgrade.plans.yearly.name',
      'upgrade.plans.monthly.name',
    ])
    expect(screen.getAllByText('upgrade.plans.recommended').filter((node) => !node.closest('[inert]'))).toHaveLength(1)
    expect(tierNamed('upgrade.plans.yearly.name')).toHaveAttribute('data-selected', 'true')
    expect(within(tierNamed('upgrade.plans.yearly.name')).getByRole('button')).toHaveAttribute('data-variant', 'primary')
    expect(tierNamed('upgrade.plans.monthly.name')).not.toHaveAttribute('data-selected')
    expect(within(tierNamed('upgrade.plans.monthly.name')).getByRole('button')).toHaveAttribute('data-variant', 'ghost')
  })

  it('switches the rendered order without starting checkout', () => {
    const onCheckout = vi.fn()
    renderSelection({ onCheckout })

    fireEvent.click(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' }))

    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'upgrade.plans.monthly.name',
      'upgrade.plans.yearly.name',
    ])
    expect(within(tierNamed('upgrade.plans.yearly.name')).getByText(
      'upgrade.plans.recommended',
    )).toBeInTheDocument()
    expect(within(tierNamed('upgrade.plans.monthly.name')).queryByText(
      'upgrade.plans.recommended',
    )).not.toBeInTheDocument()
    expect(tierNamed('upgrade.plans.yearly.name')).not.toHaveAttribute('data-selected')
    expect(within(tierNamed('upgrade.plans.yearly.name')).getByRole('button')).toHaveAttribute('data-variant', 'ghost')
    expect(tierNamed('upgrade.plans.monthly.name')).toHaveAttribute('data-selected', 'true')
    expect(within(tierNamed('upgrade.plans.monthly.name')).getByRole('button')).toHaveAttribute('data-variant', 'primary')
    expect(within(tierNamed('upgrade.plans.yearly.name')).getByRole('button')).toHaveAccessibleName(
      t('upgrade.plans.checkoutLabelRecommended', { interval: 'upgrade.plans.yearly.name' }),
    )
    expect(within(tierNamed('upgrade.plans.monthly.name')).getByRole('button')).toHaveAccessibleName(
      t('upgrade.plans.checkoutLabel', { interval: 'upgrade.plans.monthly.name' }),
    )
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('softens the loading-to-content swap', () => {
    const view = renderSelection({ plans: null, isLoading: true })
    const loadingMotion = motionMocks.renderedProps.at(-1)!

    view.rerender(<PlanSelection {...view} plans={plans} isLoading={false} />)
    const loadedMotion = motionMocks.renderedProps.at(-1)!

    expect(loadedMotion.initial).toEqual({ opacity: 0 })
    expect(loadedMotion.animate).toEqual({ opacity: 1 })
    expect(loadedMotion.transition).toEqual(expect.objectContaining({ duration: 0.22 }))
    expect(loadingMotion.exit).toEqual(expect.objectContaining({
      opacity: 0,
      transition: expect.objectContaining({ duration: 0.165 }),
    }))
    expect(Object.keys(loadedMotion.animate as object).sort()).toEqual(['opacity'])
    expect(Object.keys(loadingMotion.exit as object).filter((key) => key !== 'transition')).toEqual([
      'opacity',
    ])
  })

  it('hard-cuts loading-to-content with reduced motion', () => {
    motionMocks.reduced = true
    const view = renderSelection({ plans: null, isLoading: true })

    view.rerender(<PlanSelection {...view} plans={plans} isLoading={false} />)
    const loadedMotion = motionMocks.renderedProps.at(-1)!

    expect(loadedMotion.initial).toBe(false)
    expect(loadedMotion.transition).toEqual({ duration: 0 })
  })

  it('animates error-to-loaded with the shared entrance and exit curves', () => {
    const view = renderSelection({ plans: null, isError: true })
    const errorMotion = motionMocks.renderedProps.at(-1)!
    expect(motionMocks.presenceProps.at(-1)).toEqual({
      initial: false, mode: 'popLayout', stateKey: 'error',
    })
    expect(errorMotion.exit).toEqual({
      opacity: 0,
      transition: {
        duration: motionDurations.routeExit / 1000,
        ease: motionEasings.exit,
      },
    })

    view.rerender(<PlanSelection {...view} plans={plans} isError={false} />)
    const loadedMotion = motionMocks.renderedProps.at(-1)!

    expect(motionMocks.presenceProps.at(-1)).toEqual({
      initial: false, mode: 'popLayout', stateKey: 'loaded',
    })
    expect(loadedMotion.initial).toEqual({ opacity: 0 })
    expect(loadedMotion.animate).toEqual({ opacity: 1 })
    expect(loadedMotion.transition).toEqual({
      duration: motionDurations.base / 1000,
      ease: motionEasings.enter,
    })
  })

  it('hard-cuts error-to-loaded with reduced motion', () => {
    motionMocks.reduced = true
    const view = renderSelection({ plans: null, isError: true })
    expect(motionMocks.renderedProps.at(-1)!.exit).toEqual({ opacity: 1 })

    view.rerender(<PlanSelection {...view} plans={plans} isError={false} />)
    const loadedMotion = motionMocks.renderedProps.at(-1)!

    expect(loadedMotion.initial).toBe(false)
    expect(loadedMotion.animate).toEqual({ opacity: 1 })
    expect(loadedMotion.transition).toEqual({ duration: 0 })
  })

  it('renders annual arithmetic from the payload', () => {
    renderSelection()

    expect(tierNamed('upgrade.plans.yearly.name')).toHaveTextContent(
      formatPrice(plans.yearly.unitAmount, plans.currency),
    )
    expect(tierNamed('upgrade.plans.yearly.name')).toHaveTextContent(
      `upgrade.plans.yearly.equivalent:${JSON.stringify({
        price: formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency),
        percent: plans.savingsPercent,
      })}`,
    )
  })

  it('shows the payload coupon on both tiers only when it exists', () => {
    const couponPercentOff = 23
    const first = renderSelection({ plans: { ...plans, couponPercentOff } })
    expect(screen.getAllByText(
      `upgrade.plans.coupon.line:${JSON.stringify({ percent: couponPercentOff })}`,
    )).toHaveLength(2)

    first.unmount()
    renderSelection()
    expect(screen.queryAllByText(/upgrade\.plans\.coupon\.line/).filter((node) => !node.closest('[inert]'))).toHaveLength(0)
  })

  it('owns loading and retry states for the price tiers', () => {
    const loading = renderSelection({ plans: null, isLoading: true })
    const announcements = screen.getAllByLabelText('upgrade.plans.loading')
    expect(announcements).toHaveLength(6)
    for (const announcement of announcements) {
      expect(announcement).toHaveAttribute('role', 'progressbar')
    }
    expect(screen.getAllByRole('progressbar')).toHaveLength(6)

    const onRetry = vi.fn()
    loading.unmount()
    renderSelection({ plans: null, isLoading: false, isError: true, onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.plans.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the loaded tier measuring layout mounted while prices load', () => {
    const view = renderSelection({ plans: null, isLoading: true })
    expect(view.container.querySelectorAll('[data-tier-reservation]')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /upgrade\.plans\.checkoutLabel/ })).toBeNull()
    view.rerender(<PlanSelection {...view} plans={{ ...plans, couponPercentOff: 23 }} isLoading={false} />)
    expect(view.container.querySelectorAll('[data-tier-reservation]')).toHaveLength(2)
  })

  it.each(['yearly', 'monthly'] as const)('reserves the measured %s height through loading and coupon arrival', (interval) => {
    let measuredHeight = 317
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tier-measurement') ? measuredHeight : 0
    })
    const view = renderSelection({ plans: null, isLoading: true })
    const reservation = () => view.container.querySelector(`[data-tier-reservation="${interval}"]`)
    expect(reservation()).toHaveStyle({ minHeight: '317px' })
    expect(view.container.querySelector(`[data-tier-measurement="${interval}"]`)).toHaveAttribute('inert')
    expect(screen.queryAllByRole('button', { name: /checkoutLabel/ })).toHaveLength(0)

    view.rerender(<PlanSelection {...view} plans={{ ...plans, couponPercentOff: 23 }} isLoading={false} />)
    expect(reservation()).toHaveStyle({ minHeight: '317px' })
    measuredHeight = 389
    act(() => observers.forEach(({ measure }) => measure()))
    expect(reservation()).toHaveStyle({ minHeight: '389px' })
    view.rerender(<PlanSelection {...view} plans={plans} isLoading />)
    expect(reservation()).toHaveStyle({ minHeight: '389px' })
    view.unmount()
    expect(observers.every(({ disconnect }) => disconnect.mock.calls.length > 0)).toBe(true)
  })

  it('checks out from either tier with the same CTA verb', () => {
    const onCheckout = vi.fn()
    renderSelection({ onCheckout })

    const actions = [
      screen.getByRole('button', {
        name: `upgrade.plans.checkoutLabelRecommended:${JSON.stringify({ interval: 'upgrade.plans.yearly.name' })}`,
      }),
      screen.getByRole('button', {
        name: `upgrade.plans.checkoutLabel:${JSON.stringify({ interval: 'upgrade.plans.monthly.name' })}`,
      }),
    ]
    expect(actions).toHaveLength(2)
    expect(actions.every((action) => action.textContent === 'upgrade.plans.cta')).toBe(true)
    fireEvent.click(actions[0]!)
    fireEvent.click(actions[1]!)
    expect(onCheckout).toHaveBeenNthCalledWith(1, 'yearly')
    expect(onCheckout).toHaveBeenNthCalledWith(2, 'monthly')
  })

  it('locks paid actions during checkout', () => {
    const onCheckout = vi.fn()
    renderSelection({ checkoutLoading: 'yearly', onCheckout })

    const paidActions = screen.getAllByRole('button', { name: /upgrade\.plans\.checkoutLabel/ })
    expect(paidActions.every((action) => action.hasAttribute('disabled'))).toBe(true)
    expect(paidActions[0]).toHaveAttribute('aria-busy', 'true')
    expect(onCheckout).not.toHaveBeenCalled()
  })
})
