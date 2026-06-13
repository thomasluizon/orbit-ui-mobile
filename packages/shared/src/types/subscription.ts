import { z } from 'zod'

export const planPriceSchema = z.object({
  unitAmount: z.number(),
  currency: z.string(),
})

export type PlanPrice = z.infer<typeof planPriceSchema>

export const subscriptionPlansSchema = z.object({
  monthly: planPriceSchema,
  yearly: planPriceSchema,
  savingsPercent: z.number(),
  couponPercentOff: z.number().nullable(),
  currency: z.string(),
})

export type SubscriptionPlans = z.infer<typeof subscriptionPlansSchema>

export const billingPaymentMethodSchema = z.object({
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number(),
  expYear: z.number(),
})

export type BillingPaymentMethod = z.infer<typeof billingPaymentMethodSchema>

export const billingInvoiceSchema = z.object({
  id: z.string(),
  date: z.string(),
  amountPaid: z.number(),
  currency: z.string(),
  status: z.string(),
  hostedInvoiceUrl: z.string().nullable(),
  invoicePdf: z.string().nullable(),
  billingReason: z.string(),
})

export type BillingInvoice = z.infer<typeof billingInvoiceSchema>

export const billingDetailsSchema = z.object({
  status: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  interval: z.string(),
  amountPerPeriod: z.number(),
  currency: z.string(),
  paymentMethod: billingPaymentMethodSchema.nullable(),
  recentInvoices: z.array(billingInvoiceSchema),
})

export type BillingDetails = z.infer<typeof billingDetailsSchema>
