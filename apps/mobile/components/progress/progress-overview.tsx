import { useCallback, useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PROGRESS_SUBMENUS } from '@orbit/shared/utils/progress-navigation'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { useRootScrollToTop } from '@/components/shell/root-scroll-context'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useFlag } from '@/hooks/use-flag'
import { GuidedProgressOverview } from './guided-progress-overview'
import { WindowSection } from './progress-window'
import { progressStyles } from './progress-styles'

function ProgressOverview() {
  const { t } = useTranslation()
  const router = useRouter()
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const clearance = useShellScrollerClearance()
  const scrollRef = useRef<ScrollView>(null)
  useRootScrollToTop('progresso', useCallback(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }) }, []))
  return <ScrollView ref={scrollRef} testID="progress-overview" style={[progressStyles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={[progressStyles.content, { paddingBottom: clearance }]}>
    <RootNotificationHeader />
    <View testID="progress-sections" style={progressStyles.sections}>
      <Text accessibilityRole="header" style={progressStyles.screenReaderTitle}>{t('progressScreen.title')}</Text>
      <WindowSection tokens={tokens} />
      <SettingsGroup>
        {PROGRESS_SUBMENUS.map((entry) => <ListRow key={entry.id} placement="column" textMode="label" icon={entry.icon} title={t(entry.labelKey)} description={entry.descriptionKey ? t(entry.descriptionKey) : undefined} href={entry.route} onClick={() => router.push(entry.route)} />)}
      </SettingsGroup>
    </View>
  </ScrollView>
}

/** With `orbit_guided_flows` off, the root renders its current form. */
export function ProgressOverviewRoute() {
  return useFlag('orbit_guided_flows') ? <GuidedProgressOverview /> : <ProgressOverview />
}
