'use client'

import { useTranslations } from 'next-intl'
import { isPayGateError } from '@orbit/shared/utils'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useProfile } from '@/hooks/use-profile'
import { GuidedStreakSection } from './guided-streak-section'
import { AchievementsSection } from './progress-achievements'
import { ProgressLoading } from './progress-loading'
import { ProgressSurfaceError } from './progress-surface-error'
import { ProgressSubscreen } from './progress-subscreen'

function GamificationBody({ screen, access }: Readonly<{ screen: 'streak' | 'achievements'; access: ReturnType<typeof useGamificationAccess> }>) {
  const t = useTranslations()
  const { account, gamification, available, error, loading, retry } = access
  if (error) return <ProgressSurfaceError onRetry={retry} />
  if (loading) return <ProgressLoading label={t('progressScreen.loading')} screen={screen} />
  if (screen === 'achievements') return <AchievementsSection gamificationAvailable={available} profile={gamification.profile} xpProgress={gamification.xpProgress} />
  return <GuidedStreakSection accountProfile={account.profile} canView={available} gamificationProfile={gamification.profile} />
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

function ProgressGamificationContent({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  const access = useGamificationAccess()
  return <ProgressSubscreen screen={screen}><GamificationBody screen={screen} access={access} /></ProgressSubscreen>
}

export function ProgressGamificationRoute({ screen }: Readonly<{ screen: 'streak' | 'achievements' }>) {
  return <ProgressGamificationContent screen={screen} />
}
