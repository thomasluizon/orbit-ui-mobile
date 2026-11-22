'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ErrorState } from '@/components/ui/error-state'

import { Skeleton } from '@/components/ui/skeleton'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'
import { useRouter } from 'next/navigation'
import { deriveProfileOrbitFeatures } from '@orbit/shared/utils'
import { OrbitConnections } from '@/components/profile/orbit-connections'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { OrbitAllowancePanel } from '@/components/profile/orbit-allowance-panel'
import {
  type OrbitSettingsController,
  useOrbitSettingsController,
} from '@/components/profile/orbit-settings-controller'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { ProBadge } from '@/components/ui/pro-badge'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { isStepUpVerified } from '@/lib/step-up-storage'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslations } from 'next-intl'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslations>
type Router = ReturnType<typeof useRouter>
interface RowContext { profile: Profile | undefined; router: Router; t: Translate }

function buildOrbitRows(
  { profile, router, t }: RowContext,
  settings: OrbitSettingsController,
  apiKeysUnlocked: boolean,
) {
  const onUpgrade = () => router.push('/upgrade?from=%2Fprofile%2Fai')
  const orbitFeatures = deriveProfileOrbitFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <div className="flex flex-col" style={{ gap: 32 }}>
      <div className="flex flex-col" style={{ gap: 24 }}>
        {profile ? (
          <OrbitAllowancePanel profile={profile} />
        ) : null}
        {profile ? (
          <RowList>
            {orbitFeatures.map((feature) => !feature.locked ? (
              <ListRow
                key={feature.key}
                compact
                textMode="label"
                title={t(feature.labelKey)}
                toggle={{ checked: feature.checked, pending: feature.pending, onChange: feature.onToggle }}
                chevron={false}
              />
            ) : (
              <ListRow key={feature.key} compact textMode="label" title={t(feature.labelKey)} value={<ProBadge alwaysVisible />} chevron={false} onClick={onUpgrade} />
            ))}
          </RowList>
        ) : null}
      </div>
      <OrbitConnections hasProAccess={Boolean(profile?.hasProAccess)} />
      <ProfileApiKeys profile={profile} unlocked={apiKeysUnlocked} />
    </div>
  )
}

export function ProfileOrbitContent({ profile, patchProfile }: Readonly<ProfileContentProps>) {
  const t = useTranslations()
  const { hasReturnError, isSettling, retryReturn } = useStripeCheckoutReturn()
  const router = useRouter()
  const [apiKeysUnlocked] = useAccountScopedState(() => isStepUpVerified('keys'))
  const orbitSettings = useOrbitSettingsController(profile, patchProfile)
  if (isSettling) return <Skeleton variant="settings" rows={8} label={t('profile.loading')} />
  if (hasReturnError) return <ErrorState message={t('upgrade.billing.error')} action={<IconButton label={t('upgrade.billing.retry')} onClick={retryReturn}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
  return buildOrbitRows({ profile, router, t }, orbitSettings, apiKeysUnlocked)
}
