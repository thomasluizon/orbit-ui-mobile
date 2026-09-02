'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ONBOARDING_WEEK_START_OPTIONS } from '@orbit/shared/utils'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import { useOnboardingActions } from './onboarding-actions-context'
import type { ReactNode } from 'react'
import { AppLogo } from '@/components/ui/app-logo'
import { Chip } from '@/components/ui/chip'
import { QuietLink } from '@/components/ui/quiet-link'

interface OnboardingWelcomeProps {
  onHaveAccount?: () => void
}

export function OnboardingWelcome({
  onHaveAccount,
}: Readonly<OnboardingWelcomeProps>) {
  const t = useTranslations()
  const actions = useOnboardingActions()
  const [selectedWeekStart, setSelectedWeekStart] = useState<OnboardingWeekStartDay>(1)

  function handleWeekStartDaySelect(day: OnboardingWeekStartDay) {
    setSelectedWeekStart(day)
    void actions.setWeekStartDay(day)
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
