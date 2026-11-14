'use client'

import { useTranslations } from 'next-intl'
import { isPayGateError } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useFlag } from '@/hooks/use-flag'
import { useProfile } from '@/hooks/use-profile'
import { GuidedStreakSection } from './guided-streak-section'
import { AchievementsSection } from './progress-achievements'
import { ProgressLoading } from './progress-loading'
import { ProgressSurfaceError } from './progress-surface-error'
import { StreakSection } from './progress-streak'
import { ProgressSubscreen } from './progress-subscreen'

function GamificationBody({ screen, guided, access }: Readonly<{ screen: 'streak' | 'achievements'; guided: boolean; access: ReturnType<typeof useGamificationAccess> }>) {
  const t = useTranslations()
  const { account, gamification, available, error, loading, retry } = access
  if (error && guided) return <ProgressSurfaceError onRetry={retry} />
  if (error) return <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
  if (loading) return <ProgressLoading label={t('progressScreen.loading')} screen={screen} />
  if (screen === 'achievements') return <AchievementsSection gamificationAvailable={available} profile={gamification.profile} xpProgress={gamification.xpProgress} />
  const Section = guided ? GuidedStreakSection : StreakSection
  return <Section accountProfile={account.profile} canView={available} gamificationProfile={gamification.profile} />
}

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

function ProgressGamificationContent({ screen, guided }: Readonly<{ screen: 'streak' | 'achievements'; guided: boolean }>) {
  const access = useGamificationAccess()
  return <ProgressSubscreen screen={screen}><GamificationBody screen={screen} guided={guided} access={access} /></ProgressSubscreen>
}

/** With `orbit_guided_flows` off, Sequência renders its current form. Conquistas keeps its structure either way. */
export function ProgressGamificationRoute({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  return <ProgressGamificationContent screen={screen} guided={useFlag('orbit_guided_flows')} />
}
