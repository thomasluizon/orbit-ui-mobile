'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
import { BUTTON_SIZES } from '@orbit/shared/theme'
import { ProgressBar } from '@/components/ui/progress-bar'

interface AstraAllowancePanelProps {
  profile: Profile
}

export function AstraAllowancePanel({
  profile,
}: Readonly<AstraAllowancePanelProps>) {
  const t = useTranslations()
  const isPaidPro = profile.hasProAccess && !profile.isTrialActive
  const isSpent = profile.aiMessagesLimit > 0
    && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const actionLabel = isPaidPro
    ? t('profile.allowance.manageSubscription')
    : t('profile.allowance.seePro')
  const planLabel = profile.isTrialActive
    ? t('profile.subscription.trial')
    : isPaidPro
      ? t('profile.allowance.pro')
      : t('profile.allowance.free')

  return (
    <div
      data-testid="astra-allowance-panel"
      className="flex flex-col bg-[var(--bg-card)]"
      style={{
        gap: 12,
        padding: 16,
        borderRadius: 20,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex min-w-0 items-baseline" style={{ gap: 12 }}>
        <p className="m-0 min-w-0 flex-1 font-sans text-[17px] leading-[1.4] text-[var(--fg-1)]">
          {t('profile.allowance.title')}
        </p>
        <p className="m-0 shrink-0 font-mono text-[12px] text-[var(--fg-3)] tabular-nums">
          {t('profile.allowance.usage', {
            used: profile.aiMessagesUsed,
            limit: profile.aiMessagesLimit,
          })}
        </p>
      </div>
      <ProgressBar
        value={profile.aiMessagesUsed}
        max={profile.aiMessagesLimit}
        label={t('profile.allowance.title')}
      />
      {isSpent ? (
        <p className="m-0 font-sans text-[14px] leading-[1.5] text-[var(--fg-3)] [text-wrap:pretty]">
          {t('profile.allowance.spent')}
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
      <div className="flex">
        <Link
          href="/upgrade"
          className="touch-target inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-transparent font-medium text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] transition-[background-color,opacity,box-shadow,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-card)] active:scale-[0.96]"
          style={{
            fontFamily: 'var(--font-sans)',
            height: BUTTON_SIZES.sm.height,
            paddingInline: BUTTON_SIZES.sm.paddingX,
            fontSize: BUTTON_SIZES.sm.fontSize,
          }}
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  )
}
