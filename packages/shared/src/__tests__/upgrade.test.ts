import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  DEFAULT_FREE_COLOR_SCHEME,
  canAccessEntitlement,
  resolveAccessibleColorScheme,
  resolveUpgradeEntitlementDenial,
} from '../utils/upgrade'

function getMessageValue(
  messages: Record<string, unknown>,
  dottedKey: string,
): unknown {
  return dottedKey.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, messages)
}

describe('upgrade utils', () => {
  it('omits color schemes from upgrade surfaces and selectable preference copy', () => {
    const removedKeys = [
      'trial.expired.allColors',
      'upgrade.features.colors',
      'upgrade.plans.proFeatures.themes',
    ]

    for (const locale of [en, ptBR]) {
      for (const key of removedKeys) {
        expect(getMessageValue(locale as Record<string, unknown>, key)).toBeUndefined()
      }
    }

    expect(en.onboarding.featureGuide.settingsSection.subscriptionDesc).toBe(
      'The free tier includes goals, habits, and 5 AI messages a day. Orbit Pro raises the AI allowance to 50 a day and adds daily summaries, sub-habits, calendar sync, and the AI goal review.',
    )
    expect(ptBR.onboarding.featureGuide.settingsSection.subscriptionDesc).toBe(
      'O plano grátis inclui metas, hábitos e 5 mensagens de IA por dia. O Orbit Pro sobe a cota de IA para 50 por dia e libera resumos diários, sub-hábitos, sincronização com calendário e a análise de metas por IA.',
    )
    expect(en.tour.profile.preferences.description).toBe(
      'Customize your experience: language, timezone, week start day, push notifications, and more.',
    )
    expect(ptBR.tour.profile.preferences.description).toBe(
      'Deixe tudo do seu jeito: idioma, fuso horário, dia de início da semana, notificações push e mais.',
    )
    expect(en.profile.freshStart.preservePreferences).toBe(
      'Theme, language, and timezone',
    )
    expect(ptBR.profile.freshStart.preservePreferences).toBe(
      'Tema, idioma e fuso horário',
    )
    expect(en.privacy.dataCollected.preferences).toContain('color scheme')
    expect(ptBR.privacy.dataCollected.preferences).toContain('cor do tema')
  })

  it('has matching locale entries for the allowance pitch and no matrix copy', () => {
    const copyKeys = [
      'upgrade.convert.promise',
      'upgrade.convert.freeHeading',
      'upgrade.convert.freeEyebrow',
      'upgrade.convert.trialEyebrow',
      'upgrade.convert.trialDaysLeft',
      'upgrade.convert.trialLastDay',
      'upgrade.convert.trialHeading',
      'upgrade.convert.promise',
      'upgrade.convert.trustLine',
      'upgrade.convert.cancelAnytime',
      'upgrade.convert.handOff',
      'upgrade.plans.renewalNote',
      'upgrade.convert.allowanceLabel',
      'upgrade.convert.freeAllowance',
      'upgrade.convert.proAllowance',
      'upgrade.convert.perDay',
      'upgrade.convert.allowanceNote',
      'upgrade.outcomes.label',
      'upgrade.outcomes.calendar.title',
      'upgrade.outcomes.calendar.body',
      'upgrade.outcomes.retrospective.title',
      'upgrade.outcomes.retrospective.body',
      'upgrade.outcomes.noticing.title',
      'upgrade.outcomes.noticing.body',
      'upgrade.plans.loading',
      'upgrade.plans.intervalLabel',
      'upgrade.plans.interval.monthly',
      'upgrade.plans.interval.annual',
      'upgrade.plans.recommended',
      'upgrade.plans.cta',
      'upgrade.plans.yearly.heroLine',
      'upgrade.plans.yearly.equivalent',
      'upgrade.plans.coupon.line',
    ]

    for (const locale of [en, ptBR]) {
      for (const key of copyKeys) {
        expect(getMessageValue(locale as Record<string, unknown>, key)).toEqual(
          expect.any(String),
        )
      }
      expect(getMessageValue(locale as Record<string, unknown>, 'upgrade.matrix')).toBeUndefined()
      expect(getMessageValue(locale as Record<string, unknown>, 'upgrade.features')).toBeUndefined()
    }
  })

  it('applies plan checks consistently', () => {
    expect(canAccessEntitlement(null, null)).toBe(true)
    expect(
      canAccessEntitlement(
        { hasProAccess: false, subscriptionInterval: null, isLifetimePro: false },
        'pro',
      ),
    ).toBe(false)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'monthly', isLifetimePro: false },
        'pro',
      ),
    ).toBe(true)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'monthly', isLifetimePro: false },
        'yearlyPro',
      ),
    ).toBe(false)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'yearly', isLifetimePro: false },
        'yearlyPro',
      ),
    ).toBe(true)
  })

  it('falls back to the default free color scheme', () => {
    expect(resolveAccessibleColorScheme('blue', false)).toBe(DEFAULT_FREE_COLOR_SCHEME)
    expect(resolveAccessibleColorScheme('purple', false)).toBe('purple')
    expect(resolveAccessibleColorScheme('blue', true)).toBe('blue')
  })

  it('parses premium denials into upgrade actions', () => {
    expect(resolveUpgradeEntitlementDenial({ code: 'PAY_GATE' })).toEqual({
      shouldUpgrade: true,
      requirement: 'pro',
      reason: null,
    })

    expect(
      resolveUpgradeEntitlementDenial({
        reason: 'feature_plan_required:ai_retrospective:YearlyPro',
      }),
    ).toEqual({
      shouldUpgrade: true,
      requirement: 'yearlyPro',
      reason: 'feature_plan_required:ai_retrospective:YearlyPro',
    })
  })

  it('does not infer an upgrade path from a generic message-limit denial reason', () => {
    expect(
      resolveUpgradeEntitlementDenial({
        status: 403,
        reason: "You've reached your monthly AI message limit (500).",
      }),
    ).toEqual({
      shouldUpgrade: false,
      requirement: null,
      reason: "You've reached your monthly AI message limit (500).",
    })
  })
})
