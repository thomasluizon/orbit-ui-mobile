import { describe, expect, it } from 'vitest'
import { billingDetailsSchema } from '../types/subscription'

const billing = {
  status: 'active', currentPeriodEnd: '2026-10-04T12:00:00Z', cancelAtPeriodEnd: false,
  interval: 'monthly', amountPerPeriod: 499, currency: 'brl', paymentMethod: null, recentInvoices: [],
}

describe('billing charge contract', () => {
  it('accepts the older response without a billed amount', () => {
    expect(billingDetailsSchema.parse(billing)).toEqual(billing)
  })

  it.each([399, 0, 499, null])('preserves the optional billed amount %s', (billedAmountPerPeriod) => {
    expect(billingDetailsSchema.parse({ ...billing, billedAmountPerPeriod }).billedAmountPerPeriod).toBe(billedAmountPerPeriod)
  })

  it('rejects a billed amount with the wrong type', () => {
    expect(billingDetailsSchema.safeParse({ ...billing, billedAmountPerPeriod: '399' }).success).toBe(false)
  })
})
