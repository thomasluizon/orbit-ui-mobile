import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { formatPrice } from '@orbit/shared/utils'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')

const status = subscriptionStatusSchema.parse({ ...createMockProfile({ plan: 'pro', hasProAccess: true }), source: 'stripe' })
const cases = [
  { name: 'discounted', billedAmountPerPeriod: 399, twoFigures: true },
  { name: 'fully discounted', billedAmountPerPeriod: 0, twoFigures: true },
  { name: 'equal', billedAmountPerPeriod: 499, twoFigures: false },
  { name: 'unavailable', billedAmountPerPeriod: null, twoFigures: false },
  { name: 'absent', billedAmountPerPeriod: undefined, twoFigures: false },
]
const trees: ReactTestRenderer[] = []
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(() => tree.update(<></>))
  await i18n.changeLanguage('en')
})

describe.each(['en', 'pt-BR'])('Android billing price in %s', (locale) => {
  it.each(cases.flatMap((scenario) => ['monthly', 'yearly'].flatMap((interval) => (['light', 'dark'] as const).map((mode) => ({ ...scenario, interval, mode } as const)))))(
    'renders $name $interval billing in $mode', async ({ billedAmountPerPeriod, twoFigures, interval, mode }) => {
      await i18n.changeLanguage(locale)
      const tokens = createTokensV2('orange', mode)
      const billing = billingDetailsSchema.parse({
        status: 'active', currentPeriodEnd: '2026-10-04T12:00:00Z', cancelAtPeriodEnd: false,
        interval, amountPerPeriod: 499, currency: 'brl', paymentMethod: null, recentInvoices: [],
        ...(billedAmountPerPeriod === undefined ? {} : { billedAmountPerPeriod }),
      })
      let tree!: ReactTestRenderer
      await act(() => { tree = create(<BillingDashboard state="stripe" data={billing} status={status} locale={locale}
        isOnline usagePercent={0} usageProfile={status} onPortal={vi.fn()} onRetryPortal={vi.fn()}
        t={(key, params) => i18n.t(key, params)} tokens={tokens} />) })
      trees.push(tree)
      const texts = tree.root.findAll((node) => node.type === Text)
      const plan = formatPrice(499, 'brl')
      const referenceLabel = `${locale === 'en' ? 'Plan' : 'Plano'}: ${plan}`
      if (twoFigures) {
        const intervalLabel = locale === 'en' ? (interval === 'monthly' ? 'month' : 'year') : (interval === 'monthly' ? 'mês' : 'ano')
        const chargeLabel = `${formatPrice(billedAmountPerPeriod!, 'brl')}/${intervalLabel}`
        const charge = texts.find((node) => node.props.children === chargeLabel)
        const reference = texts.find((node) => node.props.children === referenceLabel)
        expect(charge).toBeDefined()
        expect(reference).toBeDefined()
        const line = texts.find((node) => node !== charge && node !== reference && node.findAll((child) => child === charge || child === reference).length === 2)
        expect(line).toBeDefined()
        expect(StyleSheet.flatten(line?.props.style)).toMatchObject({ fontSize: 12, fontVariant: ['tabular-nums'] })
        expect(StyleSheet.flatten(charge?.props.style)).toMatchObject({ color: tokens.fg1 })
        expect(StyleSheet.flatten(reference?.props.style)).toMatchObject({ color: tokens.fg3 })
        expect(StyleSheet.flatten(reference?.props.style as StyleProp<TextStyle>).textDecorationLine).toBeUndefined()
        expect(line?.props.numberOfLines).toBeUndefined()
      } else {
        expect(texts.some((node) => node.props.children === i18n.t(`upgrade.billing.plan.${interval === 'monthly' ? 'monthlyPrice' : 'yearlyPrice'}`, { price: plan }))).toBe(true)
        expect(texts.some((node) => node.props.children === referenceLabel)).toBe(false)
      }
    },
  )
})
