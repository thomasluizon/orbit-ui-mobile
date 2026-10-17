import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { ListRow } from '@/components/ui/list-row'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'
import { measureProfileRow, replayProfileTitleLayout } from '@/__tests__/support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

vi.unmock('react-i18next')

const status = subscriptionStatusSchema.parse({ ...createMockProfile({ plan: 'pro', hasProAccess: true }), source: 'stripe' })
const billing = billingDetailsSchema.parse({
  status: 'active', currentPeriodEnd: '2026-10-04T12:00:00Z', cancelAtPeriodEnd: false,
  interval: 'yearly', amountPerPeriod: 4990, currency: 'brl', paymentMethod: null,
  recentInvoices: ['subscription_cycle', 'subscription_create', 'subscription_update', 'manual'].flatMap((billingReason) =>
    ['paid', 'open', 'void'].map((status) => ({
      id: `${billingReason}-${status}`, date: '2026-09-04T12:00:00Z', amountPaid: 4990, currency: 'brl', status,
      invoicePdf: status === 'void' ? null : 'https://example.com/invoice.pdf', hostedInvoiceUrl: null, billingReason,
    }))),
})

type Tree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }

afterEach(async () => { __resetTestHostConfig(); await i18n.changeLanguage('en') })

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 375, 412, 480].flatMap((width) => [1, 2].map((scale) => ({ locale, width, scale })))))('keeps Android billing descriptions whole in $locale at $width, scale $scale', async ({ locale, width, scale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 2000, scale: 1, fontScale: scale })
  for (const state of ['stripe', 'offline'] as const) {
    let tree!: Tree
    await act(() => { tree = create(<BillingDashboard state={state} data={billing} status={status} locale={locale} isOnline={state !== 'offline'} usagePercent={0} usageProfile={status} onPortal={vi.fn()} onRetryPortal={vi.fn()} t={(key, params) => i18n.t(key, params)} tokens={createTokensV2('orange', 'dark')} />) as Tree })
    try {
      await replayProfileTitleLayout(tree, width - 32, scale)
      const rows = tree.root.findAll((node) => node.type === ListRow)
      expect(rows).toHaveLength(billing.recentInvoices.length)
      const labels = new Set(rows.flatMap((row) => [row.props.title, row.props.description, row.props.value].filter(Boolean)))
      const measured = measureProfileRow(tree.toJSON(), width - 32, scale)
      const texts = measured.texts.filter((text) => labels.has(text.label))
      expect(texts).toHaveLength(rows.length * 3)
      for (const text of texts) {
        expect.soft(text.clipped, text.label).toBe(false)
        expect.soft(text.left, text.label).toBeGreaterThanOrEqual(0)
        expect.soft(text.right, text.label).toBeLessThanOrEqual(width - 32)
        if (scale === 1) expect.soft(text.lines, text.label).toBe(1)
      }
      for (const row of rows) for (const text of row.findAll((node) => node.type === Text)) expect(text.props.numberOfLines, String(text.props.children)).toBeUndefined()
    } finally { await act(() => tree.update(<></>)) }
  }
})
