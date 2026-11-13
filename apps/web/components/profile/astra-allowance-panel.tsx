'use client'

import { createAstraAllowanceTranslator } from '@orbit/shared/utils'

import { useLocale, useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
import { SPACING } from '@orbit/shared/theme'
import { PillLink } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'

interface AstraAllowancePanelProps {
  profile: Profile
}

export function AstraAllowancePanel({
  profile,
}: Readonly<AstraAllowancePanelProps>) {
  const t = useTranslations()
  const translate = createAstraAllowanceTranslator(t, profile, useLocale())
  const isNonTrialPro = profile.hasProAccess && !profile.isTrialActive
  const canManageSubscription = isNonTrialPro && !profile.isLifetimePro
  const isSpent = profile.aiMessagesLimit > 0
    && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const actionLabel = canManageSubscription
    ? t('profile.allowance.manageSubscription')
    : t('profile.allowance.seePro')
  const planLabel = profile.isTrialActive
    ? t('profile.subscription.trial')
    : isNonTrialPro
      ? t('profile.allowance.pro')
      : t('profile.allowance.free')

  return (
    <div
      data-testid="astra-allowance-panel"
      className="flex flex-col bg-[var(--bg-card)]"
      style={{
        gap: 12,
        padding: SPACING.s16,
        borderRadius: 20,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex min-w-0 flex-col" style={{ gap: 4 }}>
        <p className="m-0 min-w-0 font-sans text-[17px] leading-[1.4] text-[var(--fg-1)]">
          {translate('profile.allowance.title')}
        </p>
        <p className="m-0 font-mono text-[12px] leading-[1.4] text-[var(--fg-3)] tabular-nums">
          {t('profile.allowance.usage', {
            used: profile.aiMessagesUsed,
            limit: profile.aiMessagesLimit,
          })}
        </p>
      </div>
      {profile.aiMessagesPeriod === 'week' ? <p className="m-0 text-sm text-[var(--fg-3)]">{translate('shell.composer.limit.renewal')}</p> : null}
      <ProgressBar
        value={profile.aiMessagesUsed}
        max={profile.aiMessagesLimit}
        label={translate('profile.allowance.title')}
      />
      {isSpent ? (
        <p className="m-0 font-sans text-[14px] leading-[1.5] text-[var(--fg-3)] [text-wrap:pretty]">
          {translate('profile.allowance.spent')}
        </p>
      ) : null}
      <div className="flex items-center" style={{ gap: 12 }}>
        <p className="m-0 min-w-0 flex-1 font-sans text-[14px] text-[var(--fg-3)]">
          {t('profile.allowance.plan')}
        </p>
        <p className="m-0 shrink-0 font-mono text-[12px] text-[var(--fg-2)]">
          {planLabel}
        </p>
      </div>
      {!profile.isLifetimePro ? (
        <div className="flex">
          <PillLink href="/upgrade?from=%2Fprofile%2Fastra" variant="ghost" size="sm">{actionLabel}</PillLink>
        </div>
      ) : null}
    </div>
  )
}
