'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { ONBOARDING_WEEK_START_OPTIONS } from '@orbit/shared/utils'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useOnboardingActions } from './onboarding-actions-context'
import type { ReactNode } from 'react'
import { AppLogo } from '@/components/ui/app-logo'
import { Chip } from '@/components/ui/chip'
import { QuietLink } from '@/components/ui/quiet-link'

interface OnboardingWelcomeProps {
  hasProAccess: boolean
  onHaveAccount?: () => void
}

export function OnboardingWelcome({
  hasProAccess,
  onHaveAccount,
}: Readonly<OnboardingWelcomeProps>) {
  const t = useTranslations()
  const actions = useOnboardingActions()
  const { currentScheme, applyScheme } = useColorScheme()
  const [selectedWeekStart, setSelectedWeekStart] = useState<OnboardingWeekStartDay>(1)

  function handleWeekStartDaySelect(day: OnboardingWeekStartDay) {
    setSelectedWeekStart(day)
    void actions.setWeekStartDay(day)
  }

  function handleSchemeSelect(scheme: ColorScheme) {
    applyScheme(scheme, false)
    void actions.setColorScheme(scheme)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}>
      <div
        className="flex flex-col items-center"
        style={{ gap: 20, paddingTop: 14 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 116,
            height: 116,
            background: 'rgba(var(--primary-rgb), 0.14)',
            animation: 'fresh-start-orb 0.6s var(--ease-out) both',
          }}
        >
          <AppLogo size={56} />
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
            color: 'var(--fg-1)',
            margin: 0,
          }}
        >
          {t('onboarding.flow.welcome.title')}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-2)',
            lineHeight: 1.55,
            margin: 0,
            maxWidth: 300,
          }}
        >
          {t('onboarding.flow.welcome.subtitle')}
        </p>
      </div>

      <div>
        <OnboardingSectionLabel>
          {t('onboarding.flow.welcome.weekStart')}
        </OnboardingSectionLabel>
        <div className="flex justify-center" style={{ gap: 12 }}>
          {ONBOARDING_WEEK_START_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={selectedWeekStart === option.value}
              onClick={() => handleWeekStartDaySelect(option.value)}
            >
              {t(option.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      {hasProAccess && (
        <div>
          <OnboardingSectionLabel>
            {t('onboarding.flow.welcome.colorScheme')}
          </OnboardingSectionLabel>
          <div className="flex justify-center" style={{ gap: 12 }}>
            {colorSchemeOptions.map((option) => {
              const isActive = currentScheme === option.value
              return (
                <button
                  type="button"
                  key={option.value}
                  className="inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer"
                  style={{ width: 44, height: 44 }}
                  aria-label={t(
                    `preferences.color${option.value.charAt(0).toUpperCase() + option.value.slice(1)}`,
                  )}
                  aria-pressed={isActive}
                  onClick={() => handleSchemeSelect(option.value)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: option.color,
                      boxShadow: isActive
                        ? 'inset 0 0 0 2px var(--bg), 0 0 0 2px var(--fg-1)'
                        : 'inset 0 0 0 1px var(--hairline-strong)',
                    }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {onHaveAccount && (
        <div className="flex justify-center">
          <QuietLink onClick={onHaveAccount}>
            {t('onboarding.flow.saveYourPlan.haveAccount')}
          </QuietLink>
        </div>
      )}
    </div>
  )
}

function OnboardingSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="text-center uppercase"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.08em',
        color: 'var(--fg-3)',
        paddingTop: 12,
        paddingBottom: 10,
      }}
    >
      {children}
    </div>
  )
}
