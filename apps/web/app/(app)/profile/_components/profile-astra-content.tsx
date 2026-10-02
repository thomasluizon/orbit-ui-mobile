'use client'

import { useRouter } from 'next/navigation'
import { deriveProfileAstraFeatures } from '@orbit/shared/utils'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import {
  AstraSettingsSwitch,
  type AstraSettingsController,
  useAstraSettingsController,
} from '@/components/profile/astra-settings-controller'
import {
  ProfileValueRow,
} from '@/components/profile/profile-settings-frame'
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
  const onUpgrade = () => router.push('/upgrade')
  const astraFeatures = deriveProfileAstraFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <div className="flex flex-col" style={{ gap: 32 }}>
      <div className="flex flex-col" style={{ gap: 12 }}>
      {profile ? (
        <AstraAllowancePanel profile={profile} />
      ) : null}
      {profile ? (
        <RowList>
          {astraFeatures.map((feature) => !feature.locked ? (
            <ProfileValueRow
              key={feature.key}
              label={t(feature.labelKey)}
              control={<AstraSettingsSwitch checked={feature.checked} pending={feature.pending} label={t(feature.labelKey)} onToggle={feature.onToggle} />}
            />
          ) : (
            <ListRow key={feature.key} compact icon={icon(Lock)} title={t(feature.labelKey)} trailing={<ProBadge alwaysVisible />} chevron={false} onClick={onUpgrade} />
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
  const router = useRouter()
  const [apiKeysUnlocked] = useAccountScopedState(() => isStepUpVerified('keys'))
  const astraSettings = useAstraSettingsController(profile, patchProfile)
  return buildAstraRows({ profile, router, t }, astraSettings, apiKeysUnlocked)
}
