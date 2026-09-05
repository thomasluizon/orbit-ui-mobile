import { test as base } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema, subscriptionStatusSchema, type SupportedLocale } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { billingDetailsFixture } from '../../test-support/hermetic/mock-api/fixtures/subscriptions'
import { LAYOUT_ORIGIN } from '../support/env'

const subscriptions = {
  free: subscriptionStatusSchema.parse({ ...profileFixture, source: null }),
  trial: subscriptionStatusSchema.parse({
    ...profileFixture,
    source: null,
    hasProAccess: true,
    isTrialActive: true,
    trialEndsAt: '2026-09-18T12:00:00Z',
    aiMessagesLimit: 50,
  }),
  stripe: subscriptionStatusSchema.parse({
    ...profileFixture,
    plan: 'pro',
    hasProAccess: true,
    planExpiresAt: '2026-10-04T12:00:00Z',
    subscriptionInterval: 'yearly',
    source: 'stripe',
    aiMessagesUsed: 18,
    aiMessagesLimit: 50,
  }),
  play: subscriptionStatusSchema.parse({
    ...profileFixture,
    plan: 'pro',
    hasProAccess: true,
    planExpiresAt: '2026-10-04T12:00:00Z',
    subscriptionInterval: 'yearly',
    source: 'play',
    aiMessagesUsed: 18,
    aiMessagesLimit: 50,
  }),
  lifetime: subscriptionStatusSchema.parse({
    ...profileFixture,
    plan: 'pro',
    hasProAccess: true,
    isLifetimePro: true,
    source: 'stripe',
    aiMessagesUsed: 18,
    aiMessagesLimit: 50,
  }),
  canceled: subscriptionStatusSchema.parse({
    ...profileFixture,
    plan: 'pro',
    hasProAccess: true,
    planExpiresAt: '2026-10-04T12:00:00Z',
    subscriptionInterval: 'yearly',
    source: 'stripe',
    aiMessagesUsed: 18,
    aiMessagesLimit: 50,
  }),
  pastDue: subscriptionStatusSchema.parse({
    ...profileFixture,
    plan: 'pro',
    hasProAccess: true,
    planExpiresAt: '2026-10-04T12:00:00Z',
    subscriptionInterval: 'yearly',
    source: 'stripe',
    aiMessagesUsed: 18,
    aiMessagesLimit: 50,
  }),
}

const billingByState = {
  free: billingDetailsFixture,
  trial: billingDetailsFixture,
  stripe: billingDetailsFixture,
  play: billingDetailsFixture,
  lifetime: billingDetailsFixture,
  canceled: billingDetailsSchema.parse({ ...billingDetailsFixture, cancelAtPeriodEnd: true }),
  pastDue: billingDetailsSchema.parse({ ...billingDetailsFixture, status: 'past_due' }),
} satisfies Record<keyof typeof subscriptions, typeof billingDetailsFixture>

export const test = base.extend<{
  subscriptionState: keyof typeof subscriptions
  appLocale: SupportedLocale
}>({
  subscriptionState: ['free', { option: true }],
  appLocale: ['en', { option: true }],
  page: async ({ page, context, subscriptionState, appLocale }, runTest) => {
    const subscription = subscriptions[subscriptionState]
    const profile = profileSchema.parse({ ...profileFixture, ...subscription, language: appLocale })
    await context.addCookies([{ name: 'i18n_locale', value: appLocale, url: LAYOUT_ORIGIN }])
    await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
    await context.route(`${LAYOUT_ORIGIN}${API.subscription.status}`, (route) => route.fulfill({ json: subscription }))
    await context.route(`${LAYOUT_ORIGIN}${API.subscription.billing}`, (route) =>
      route.fulfill({ json: billingByState[subscriptionState] }))
    await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'))
    await runTest(page)
  },
})
