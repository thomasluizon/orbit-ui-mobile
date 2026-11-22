import { ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isPayGateError } from '@orbit/shared/utils'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { GuidedStreakSection } from './guided-streak-section'
import { AchievementsSection } from './progress-achievements'
import { ProgressLoading } from './progress-loading'
import { ProgressSurfaceError } from './progress-surface-error'
import { ProgressSubscreen } from './progress-subscreen'
import { progressStyles } from './progress-styles'

function useGamificationAccess() {
  const account = useProfile()
  const canView = account.profile?.canViewGamification ?? false
  const gamification = useGamificationProfile(canView)
  const available = canView && !isPayGateError(gamification.error)
  const error = account.isError || (available && gamification.isError)
  const loading = !error && (account.isLoading || (available && gamification.isLoading))
  const retry = () => { void account.refetch(); void gamification.refetch() }
  return { account, gamification, available, error, loading, retry }
}

function GamificationBody({ screen, access, tokens }: Readonly<{ screen: 'streak' | 'achievements'; access: ReturnType<typeof useGamificationAccess>; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const { account, gamification, available, error, loading, retry } = access
  if (error) return <ProgressSurfaceError onRetry={retry} />
  if (loading) return <ProgressLoading label={t('progressScreen.loading')} screen={screen} />
  if (screen === 'achievements') return <AchievementsSection gamificationAvailable={available} profile={gamification.profile} xpProgress={gamification.xpProgress} tokens={tokens} />
  return <GuidedStreakSection accountProfile={account.profile} canView={available} gamificationProfile={gamification.profile} tokens={tokens} />
}

function ProgressGamificationContent({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const clearance = useShellPageEnd().paddingBottom
  const access = useGamificationAccess()
  return <ProgressSubscreen screen={screen}>
    <ScrollView style={progressStyles.root} contentContainerStyle={[progressStyles.sections, progressStyles.fill, { paddingBottom: clearance }]}>
      <GamificationBody screen={screen} access={access} tokens={tokens} />
    </ScrollView>
  </ProgressSubscreen>
}

export function ProgressGamificationRoute({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  return <ProgressGamificationContent screen={screen} />
}
