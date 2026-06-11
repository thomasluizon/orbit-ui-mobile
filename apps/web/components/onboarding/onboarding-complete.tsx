'use client'

import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { VerifiedBadge } from '@/components/ui/verified-badge'

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

export function OnboardingComplete({
  createdHabit,
  createdGoal,
  onFinish,
}: Readonly<OnboardingCompleteProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()

  const trialEndsAt = profile?.trialEndsAt
  const formattedTrialEnd = useMemo(() => {
    if (!trialEndsAt) return ''
    return displayDate(parseISO(trialEndsAt))
  }, [trialEndsAt, displayDate])

  const recapItems = useMemo(() => {
    const items = [
      {
        key: 'habit',
        label: t('onboarding.flow.complete.recap.habit'),
        show: !!createdHabit,
      },
      {
        key: 'goal',
        label: t('onboarding.flow.complete.recap.goal'),
        show: createdGoal,
      },
      {
        key: 'theme',
        label: t('onboarding.flow.complete.recap.theme'),
        show: hasProAccess,
      },
      {
        key: 'astra',
        label: t('onboarding.flow.complete.recap.astra'),
        show: true,
      },
    ]
    return items.filter((item) => item.show)
  }, [createdHabit, createdGoal, hasProAccess, t])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '12px 0' }}>
      <div
        className="flex flex-col items-center"
        style={{ gap: 14, paddingTop: 14 }}
      >
        <VerifiedBadge size={96} />
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
            color: 'var(--fg-1)',
            margin: '6px 0 0',
          }}
        >
          {t('onboarding.flow.complete.title')}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            lineHeight: 1.5,
            maxWidth: 280,
            margin: 0,
          }}
        >
          {t('onboarding.flow.complete.subtitle')}
        </p>
      </div>

      <div>
        {recapItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between"
            style={{ padding: '11px 0', borderBottom: '1px solid var(--hairline)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: 'var(--fg-2)',
              }}
            >
              {item.label}
            </span>
            <Check size={18} strokeWidth={1.8} color="var(--primary)" />
          </div>
        ))}
      </div>

      {profile?.isTrialActive && (
        <InfoCard
          title={t('onboarding.flow.complete.trialTitle')}
          desc={t('onboarding.flow.complete.trialDesc', { date: formattedTrialEnd })}
        />
      )}

      <div style={{ marginTop: 8 }}>
        <PillButton fullWidth onClick={onFinish}>
          {t('onboarding.flow.complete.start')}
        </PillButton>
      </div>
    </div>
  )
}
