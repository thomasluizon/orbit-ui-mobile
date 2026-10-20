import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { profileFixture } from './profile'

export const subscriptionStatusFixture = subscriptionStatusSchema.parse({
  ...profileFixture,
  plan: 'pro',
  hasProAccess: true,
  aiMessagesUsed: 18,
  aiMessagesLimit: 50,
  planExpiresAt: '2026-10-04T12:00:00Z',
  subscriptionInterval: 'yearly',
  source: 'stripe',
})

export const billingDetailsFixture = billingDetailsSchema.parse({
  status: 'active',
  currentPeriodEnd: '2026-10-04T12:00:00Z',
  cancelAtPeriodEnd: false,
  interval: 'yearly',
  amountPerPeriod: 4990,
  currency: 'usd',
  paymentMethod: {
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
  },
  recentInvoices: [
    {
      id: 'in_preview_001',
      date: '2026-09-04T12:00:00Z',
      amountPaid: 4990,
      currency: 'usd',
      status: 'paid',
      hostedInvoiceUrl: 'https://example.com/invoices/in_preview_001',
      invoicePdf: 'https://example.com/invoices/in_preview_001.pdf',
      billingReason: 'subscription_cycle',
    },
  ],
})
