import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { ProgressGoalsContent } from './goals/progress-goals-content'
import { ProgressGamificationRoute } from './progress-gamification-content'
import { ProgressOverviewRoute } from './progress-overview'

export function ProgressContent({ screen = 'overview' }: Readonly<{ screen?: ProgressSubmenuId | 'overview' }>) {
  if (screen === 'overview') return <ProgressOverviewRoute />
  if (screen === 'goals') return <ProgressGoalsContent />
  return <ProgressGamificationRoute screen={screen} />
}
