import { useRouter } from 'expo-router'
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
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { isStepUpVerified } from '@/lib/step-up-storage'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Lock } from '@/components/ui/icons'
import { View } from 'react-native'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslation>['t']
type Router = ReturnType<typeof useRouter>
interface RowContext { profile: Profile | undefined; router: Router; t: Translate }

const icon = (IconComponent: typeof Lock) => <IconComponent size={24} strokeWidth={1.8} />

function buildAstraRows(
  { profile, router, t }: RowContext,
  settings: AstraSettingsController,
  apiKeysUnlocked: boolean,
) {
  const onUpgrade = () => router.push(buildUpgradeHref('/profile/astra'))
  const astraFeatures = deriveProfileAstraFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <View style={{ gap: 32 }}>
      <View style={{ gap: 24 }}>
        {profile ? (
          <AstraAllowancePanel
            profile={profile}
            onPlanAction={() => router.push(buildUpgradeHref('/profile/astra'))}
          />
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
      </View>
      <ProfileApiKeys profile={profile} unlocked={apiKeysUnlocked} />
    </View>
  )
}

export function ProfileAstraContent({ profile, patchProfile }: Readonly<ProfileContentProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const [apiKeysUnlocked] = useState(() => isStepUpVerified('keys'))
  const astraSettings = useAstraSettingsController(profile, patchProfile)
  return buildAstraRows({ profile, router, t }, astraSettings, apiKeysUnlocked)
}
