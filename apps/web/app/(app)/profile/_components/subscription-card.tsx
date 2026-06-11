'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CreditCard } from 'lucide-react'
import { plural } from '@/lib/plural'
import type { Profile } from '@orbit/shared/types/profile'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'

interface SubscriptionCardProps {
  profile: Profile | undefined
  trialDaysLeft: number | null
  trialExpired: boolean
}

function getSubscriptionLabel(
  profile: Profile | undefined,
  trialExpired: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  if (profile?.isTrialActive) return t('profile.subscription.trial')
  if (profile?.hasProAccess) return t('profile.subscription.pro')
  if (trialExpired) return t('profile.subscription.trialEnded')
  return t('profile.subscription.free')
}

function getSubscriptionHint(
  profile: Profile | undefined,
  trialExpired: boolean,
  trialDaysLeft: number | null,
  t: ReturnType<typeof useTranslations>,
) {
  if (profile?.isTrialActive) {
    return plural(
      t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }),
      trialDaysLeft ?? 0,
    )
  }
  if (profile?.hasProAccess) return t('profile.subscription.proHint')
  if (trialExpired) return t('profile.subscription.trialEndedHint')
  return t('profile.subscription.freeHint')
}

/** Canon Assinatura ListRow: credit-card icon, plan label, status line, chevron to /upgrade. */
export function SubscriptionCard({
  profile,
  trialDaysLeft,
  trialExpired,
}: Readonly<SubscriptionCardProps>) {
  const t = useTranslations()
  const router = useRouter()
  const label = getSubscriptionLabel(profile, trialExpired, t)
  const hint = getSubscriptionHint(profile, trialExpired, trialDaysLeft, t)

  return (
    <SettingsGroup>
      <SettingsGroupRow
        icon={<CreditCard size={22} strokeWidth={1.8} color="var(--fg-1)" />}
        label={t('profile.subscription.plan')}
        hint={hint ? `${label} · ${hint}` : label}
        onClick={() => router.push('/upgrade')}
        ariaLabel={
          profile?.hasProAccess && !profile.isTrialActive
            ? t('profile.subscription.manage')
            : t('common.upgrade')
        }
      />
    </SettingsGroup>
  )
}
