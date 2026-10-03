import { measureTextOverflow } from './text-overflow-geometry'
import { expect, test } from '@playwright/test'
import { measureOnboardingProStep } from './onboarding-pro-step-geometry'
import { API } from '@orbit/shared/api'
import { buildAccountScopedStorageKey, ONBOARDING_PRO_PENDING_KEY } from '@orbit/shared/utils'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { subscriptionPlansFixtures } from '../../test-support/hermetic/mock-api/fixtures/subscription-plans'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const branch of ['trial', 'paywall'] as const) {
    for (const width of [412, 1280]) {
      test(`${locale} onboarding ${branch} geometry at ${width}`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 1800 })
        const profile = profileSchema.parse({ ...profileFixture, hasCompletedOnboarding: true, language: locale, isTrialActive: branch === 'trial', hasProAccess: branch === 'trial', plan: branch === 'trial' ? 'pro' : 'free', trialEndsAt: branch === 'trial' ? '2026-09-19T12:00:00Z' : '2026-09-01T12:00:00Z' })
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.subscription.plans, (route) => route.fulfill({ json: subscriptionPlansFixtures[locale === 'pt-BR' ? 'brl' : 'usd'] }))
        await page.addInitScript(({ key, language }) => {
          localStorage.setItem(key, '1')
          document.cookie = `i18n_locale=${language};path=/;samesite=strict`
        }, { key: buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, 'hermetic-perf-user'), language: locale })
        await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'))
        await page.goto('/')
        const step = page.locator(`[data-onboarding-step="${branch}"]`)
        await expect(step).toBeVisible()
        if (branch === 'paywall') {
          const cards = step.locator('[data-tier-content]')
          await expect(cards).toHaveCount(2)
          await expect(step.getByRole('list', { name: messages.upgrade.outcomes.label, exact: true })).toHaveCount(2)
          for (const interval of ['yearly', 'monthly'] as const) {
            const card = cards.filter({ has: page.getByRole('heading', { name: messages.upgrade.plans[interval].name, exact: true }) })
            await expect(card).toHaveAttribute('data-tier-content', interval)
            const outcomes = card.getByRole('list', { name: messages.upgrade.outcomes.label, exact: true })
            await expect(outcomes.getByRole('listitem')).toHaveCount(4)
            for (const key of ['astra', 'calendar', 'retrospective', 'noticing'] as const) {
              await expect(outcomes.getByText(messages.upgrade.outcomes[key], { exact: true })).toBeVisible()
            }
          }
        }
        await page.evaluate(() => document.fonts.ready)
        const bounds = await step.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.width).toBeLessThanOrEqual(width >= 1024 ? 560 : 440)
        const geometry = await step.evaluate(measureOnboardingProStep)
        expect(geometry.horizontalOffset).toBeLessThanOrEqual(1)
        expect(await step.evaluate(measureTextOverflow)).toEqual([])
        expect(geometry.wrappedActions).toEqual([])
        if (branch === 'trial') {
          await expect(step.getByRole('button', { name: messages.onboarding.flow.done.seeDay, exact: true })).toHaveCount(1)
          await expect(step.locator('[data-tier-content]')).toHaveCount(0)
          expect(geometry.tiers).toEqual([])
        } else {
          await expect(step.getByRole('link', { name: messages.upgrade.convert.stayFree })).toBeVisible()
          await expect(step.locator('[data-tier-content]')).toHaveCount(2)
          expect(geometry.tiers.map((tier) => tier.interval)).toEqual(['yearly', 'monthly'])
          for (const tier of geometry.tiers) {
            expect(tier.height).toBeCloseTo(tier.contentHeight, 0)
            expect(tier.belowButton).toBeCloseTo(tier.padding, 0)
          }
        }
      })
    }
  }
}
