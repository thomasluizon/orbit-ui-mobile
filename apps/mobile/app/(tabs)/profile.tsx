import { useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileSettingsFrame } from '@/components/profile/profile-settings-frame'
import { AppBar } from '@/components/ui/app-bar'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { createProfileStyles } from './profile/_components/profile-styles'

export default function ProfileScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile, isLoading, error } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createProfileStyles(), [])
  const groupLabels = {
    you: t('profile.groups.you'),
    astra: t('profile.groups.astra'),
    notifications: t('profile.groups.notifications'),
    more: t('profile.groups.more'),
    ending: t('profile.groups.ending'),
  }

  const moreRows = PROFILE_NAV_ITEMS.map((item) => (
    <ListRow
      key={item.id}
      icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
      title={t(item.titleKey)}
      description={t(item.hintKey)}
      trailing={item.proBadge ? <ProBadge alwaysVisible /> : undefined}
      onClick={() => {
        router.push(
          shouldRedirectProfileNavItem(item, profile)
            ? buildUpgradeHref('/profile')
            : item.route,
        )
      }}
    />
  ))

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
    >
      <AppBar title={t('nav.profile')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: tokens.statusBadText }]}>
              {__DEV__ && error instanceof Error
                ? error.message
                : t('errors.loadProfile')}
            </Text>
          </View>
        ) : null}
        <ProfileSettingsFrame
          isLoading={isLoading}
          loadingLabel={t('profile.loading')}
          labels={groupLabels}
          rows={{ more: moreRows }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
