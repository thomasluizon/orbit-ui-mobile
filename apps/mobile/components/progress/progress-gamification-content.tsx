import { ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isPayGateError } from '@orbit/shared/utils'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useProfile } from '@/hooks/use-profile'
import { useFlag } from '@/hooks/use-flag'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { GuidedStreakSection } from './guided-streak-section'
import { AchievementsSection } from './progress-achievements'
import { ProgressLoading } from './progress-loading'
import { ProgressSurfaceError } from './progress-surface-error'
import { StreakSection } from './progress-streak'
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

function GamificationBody({ screen, guided, access, tokens }: Readonly<{ screen: 'streak' | 'achievements'; guided: boolean; access: ReturnType<typeof useGamificationAccess>; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const { account, gamification, available, error, loading, retry } = access
  if (error && guided) return <ProgressSurfaceError onRetry={retry} />
  if (error) return <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} />
  if (loading) return <ProgressLoading label={t('progressScreen.loading')} screen={screen} />
  if (screen === 'achievements') return <AchievementsSection gamificationAvailable={available} profile={gamification.profile} xpProgress={gamification.xpProgress} tokens={tokens} />
  const Section = guided ? GuidedStreakSection : StreakSection
  return <Section accountProfile={account.profile} canView={available} gamificationProfile={gamification.profile} tokens={tokens} />
}

function ProgressGamificationContent({ screen, guided }: Readonly<{ screen: 'streak' | 'achievements'; guided: boolean }>) {
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const clearance = useShellPageEnd().paddingBottom
  const access = useGamificationAccess()
  return <ProgressSubscreen screen={screen}>
    <ScrollView style={progressStyles.root} contentContainerStyle={[progressStyles.sections, guided ? progressStyles.fill : null, { paddingBottom: clearance }]}>
      <GamificationBody screen={screen} guided={guided} access={access} tokens={tokens} />
    </ScrollView>
  </ProgressSubscreen>
}

/** With `orbit_guided_flows` off, Sequência renders its current form. Conquistas keeps its structure either way. */
export function ProgressGamificationRoute({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  return <ProgressGamificationContent screen={screen} guided={useFlag('orbit_guided_flows')} />
}
