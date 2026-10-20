import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { formatPrice } from '@orbit/shared/utils'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'

const status = subscriptionStatusSchema.parse({ ...createMockProfile({ plan: 'pro', hasProAccess: true }), source: 'stripe' })

const intervalLabels = {
  en: { monthly: 'month', yearly: 'year' },
  'pt-BR': { monthly: 'mês', yearly: 'ano' },
} as const
const exactText = { normalizer: (text: string) => text }
const cases = [
  { name: 'discounted', billedAmountPerPeriod: 399, twoFigures: true },
  { name: 'fully discounted', billedAmountPerPeriod: 0, twoFigures: true },
  { name: 'equal', billedAmountPerPeriod: 499, twoFigures: false },
  { name: 'unavailable', billedAmountPerPeriod: null, twoFigures: false },
  { name: 'absent', billedAmountPerPeriod: undefined, twoFigures: false },
]

describe.each(['en', 'pt-BR'] as const)('billing price in %s', (locale) => {
  it.each(cases.flatMap((scenario) => (['monthly', 'yearly'] as const).map((interval) => ({ ...scenario, interval }))))(
    'renders $name $interval billing', ({ billedAmountPerPeriod, twoFigures, interval }) => {
      const billing = billingDetailsSchema.parse({
        status: 'active', currentPeriodEnd: '2026-10-04T12:00:00Z', cancelAtPeriodEnd: false,
        interval, amountPerPeriod: 499, currency: 'brl', paymentMethod: null, recentInvoices: [],
        ...(billedAmountPerPeriod === undefined ? {} : { billedAmountPerPeriod }),
      })
      const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
      render(<BillingDashboard state="stripe" billing={billing} status={status} locale={locale}
        usagePercent={0} usageUrgent={false} onOpenPortal={vi.fn()} onRetryPortal={vi.fn()} t={t} />)
      const plan = formatPrice(499, 'brl')
      const referenceLabel = `${locale === 'en' ? 'Plan' : 'Plano'}: ${plan}`
      const planLine = t(`upgrade.billing.plan.${interval === 'monthly' ? 'monthlyPrice' : 'yearlyPrice'}`, { price: plan })
      if (twoFigures) {
        const intervalLabel = intervalLabels[locale][interval]
        const charge = screen.getByText(`${formatPrice(billedAmountPerPeriod!, 'brl')}/${intervalLabel}`, exactText)
        const reference = screen.getByText(referenceLabel, exactText)
        expect(charge.closest('p')).toBe(reference.closest('p'))
        expect(charge.closest('s, del')).toBeNull()
        expect(reference.closest('s, del')).toBeNull()
        expect(screen.queryByText(planLine, exactText)).not.toBeInTheDocument()
      } else {
        expect(screen.getByText(planLine, exactText)).toBeInTheDocument()
        expect(screen.queryByText(referenceLabel, exactText)).not.toBeInTheDocument()
      }
    },
  )
})
