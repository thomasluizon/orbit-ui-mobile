import { test as base } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema, subscriptionStatusSchema, type SupportedLocale } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
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
}

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
    await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'))
    await runTest(page)
  },
})
