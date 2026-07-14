'use client'

import { useMemo, type CSSProperties } from 'react'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOnboardingIsLive } from '@/components/onboarding/onboarding-actions-context'
import { useDateFormat } from '@/hooks/use-date-format'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { VerifiedBadge } from '@/components/ui/verified-badge'

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 34,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  lineHeight: 1.15,
  color: 'var(--fg-1)',
  margin: '6px 0 0',
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '180ms',
}

const subtitleStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  color: 'var(--fg-2)',
  lineHeight: 1.5,
  maxWidth: 280,
  margin: 0,
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '240ms',
}

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  hasProAccess: boolean
  finishLabel?: string
  onFinish: () => void
}

export function OnboardingComplete({
  createdHabit,
  createdGoal,
  hasProAccess,
  finishLabel,
  onFinish,
}: Readonly<OnboardingCompleteProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()
  const isLive = useOnboardingIsLive()
  const { profile } = useProfile({ enabled: isLive })

  const trialEndsAt = profile?.trialEndsAt
  const formattedTrialEnd = useMemo(() => {
    if (!trialEndsAt) return ''
    return displayDate(parseISO(trialEndsAt))
    // react-doctor-disable-next-line exhaustive-deps -- trialEndsAt already aliases profile.trialEndsAt in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
        <div style={{ animation: 'fresh-start-orb 0.6s var(--ease-out) both' }}>
          <div className="animate-check-pop" style={{ animationDelay: '420ms' }}>
            <VerifiedBadge size={96} />
          </div>
        </div>
        <h1 className="text-center" style={titleStyle}>
          {isLive
            ? t('onboarding.flow.complete.title')
            : t('onboarding.flow.saveYourPlan.title')}
        </h1>
        <p className="text-center" style={subtitleStyle}>
          {isLive
            ? t('onboarding.flow.complete.subtitle')
            : t('onboarding.flow.saveYourPlan.subtitle')}
        </p>
      </div>

      <div
        className="stagger-enter"
        style={{ animation: 'slide-up-fade 0.28s var(--ease-out) backwards', animationDelay: '300ms' }}
      >
        {recapItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between"
            style={{ padding: '11px 0', borderBottom: '1px solid var(--hairline)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
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
        <div
          style={{
            animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
            animationDelay: '380ms',
          }}
        >
          <InfoCard
            title={t('onboarding.flow.complete.trialTitle')}
            desc={t('onboarding.flow.complete.trialDesc', { date: formattedTrialEnd })}
          />
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
          animationDelay: '440ms',
        }}
      >
        <PillButton fullWidth onClick={onFinish}>
          {finishLabel ?? t('onboarding.flow.complete.start')}
        </PillButton>
      </div>
    </div>
  )
}
