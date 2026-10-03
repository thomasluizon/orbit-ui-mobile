'use client'

import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'
import { useRouter } from 'next/navigation'
import { deriveProfileAstraFeatures } from '@orbit/shared/utils'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import {
  AstraSettingsSwitch,
  type AstraSettingsController,
  useAstraSettingsController,
} from '@/components/profile/astra-settings-controller'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { ProBadge } from '@/components/ui/pro-badge'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { isStepUpVerified } from '@/lib/step-up-storage'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslations } from 'next-intl'
import { Lock } from '@/components/ui/icons'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslations>
type Router = ReturnType<typeof useRouter>
interface RowContext { profile: Profile | undefined; router: Router; t: Translate }

const icon = (IconComponent: typeof Lock) => <IconComponent size={24} strokeWidth={1.8} />

function buildAstraRows(
  { profile, router, t }: RowContext,
  settings: AstraSettingsController,
  apiKeysUnlocked: boolean,
) {
  const onUpgrade = () => router.push('/upgrade?from=%2Fprofile%2Fastra')
  const astraFeatures = deriveProfileAstraFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <div className="flex flex-col" style={{ gap: 32 }}>
      <div className="flex flex-col" style={{ gap: 24 }}>
        {profile ? (
          <AstraAllowancePanel profile={profile} />
        ) : null}
        {profile ? (
          <RowList>
            {astraFeatures.map((feature) => !feature.locked ? (
              <ListRow
                key={feature.key}
                compact
                textMode="label"
                title={t(feature.labelKey)}
                trailing={<AstraSettingsSwitch checked={feature.checked} pending={feature.pending} label={t(feature.labelKey)} onToggle={feature.onToggle} />}
                chevron={false}
                readOnly
              />
            ) : (
              <ListRow key={feature.key} compact textMode="label" icon={icon(Lock)} title={t(feature.labelKey)} trailing={<ProBadge alwaysVisible />} chevron={false} onClick={onUpgrade} />
            ))}
          </RowList>
        ) : null}
      </div>
      <ProfileApiKeys profile={profile} unlocked={apiKeysUnlocked} />
    </div>
  )
}

export function ProfileAstraContent({ profile, patchProfile }: Readonly<ProfileContentProps>) {
  const t = useTranslations()
  const { hasReturnError, isSettling, retryReturn } = useStripeCheckoutReturn()
  const router = useRouter()
  const [apiKeysUnlocked] = useAccountScopedState(() => isStepUpVerified('keys'))
  const astraSettings = useAstraSettingsController(profile, patchProfile)
  if (isSettling) return <Skeleton variant="settings" rows={8} label={t('profile.loading')} />
  if (hasReturnError) return <ErrorState message={t('upgrade.billing.error')} action={<PillButton variant="ghost" onClick={retryReturn}>{t('upgrade.billing.retry')}</PillButton>} />
  return buildAstraRows({ profile, router, t }, astraSettings, apiKeysUnlocked)
}
