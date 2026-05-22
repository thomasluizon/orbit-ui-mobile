'use client'

import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'

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
      {/* Filled primary disc + check */}
      <div
        className="flex flex-col items-center"
        style={{ gap: 14, paddingTop: 14 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 64, height: 64, background: 'var(--primary)' }}
        >
          <Check
            className="size-7"
            style={{ color: 'var(--fg-on-primary)' }}
            strokeWidth={2.4}
          />
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--fg-1)',
            margin: 0,
          }}
        >
          {t('onboarding.flow.complete.title')}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            color: 'var(--fg-2)',
            lineHeight: 1.5,
            maxWidth: 280,
            margin: 0,
          }}
        >
          {t('onboarding.flow.complete.subtitle')}
        </p>
      </div>

      {/* Recap list (hairline-divided flush rows) */}
      <div>
        {recapItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between"
            style={{ padding: '11px 0', borderBottom: '1px solid var(--hairline)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                color: 'var(--fg-1)',
              }}
            >
              {item.label}
            </span>
            <Check size={15} strokeWidth={1.8} color="var(--primary)" />
          </div>
        ))}
      </div>

      {/* Trial info -- compact italic copy */}
      {profile?.isTrialActive && (
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-2)',
            lineHeight: 1.55,
          }}
        >
          <span style={{ fontWeight: 600, fontStyle: 'normal', color: 'var(--fg-1)' }}>
            {t('onboarding.flow.complete.trialTitle')}
          </span>
          {' — '}
          {t('onboarding.flow.complete.trialDesc', { date: formattedTrialEnd })}
        </div>
      )}

      <button
        type="button"
        className="appearance-none border-0 cursor-pointer"
        onClick={onFinish}
        style={{
          padding: '12px 18px',
          marginTop: 8,
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          borderRadius: 10,
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {t('onboarding.flow.complete.start')}
      </button>
    </div>
  )
}
