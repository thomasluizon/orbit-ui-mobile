'use client'

import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { Skeleton } from '@/components/ui/skeleton'

export function ProgressLoading({ label, screen }: Readonly<{ label: string; screen: ProgressSubmenuId }>) {
  return <div className="flex flex-col gap-8" role="progressbar" aria-label={label} aria-busy="true">
    {screen !== 'goals' ? <Skeleton variant="settings" grouped /> : null}
    {screen === 'streak' ? <>
      <div className="h-[20px]"><Skeleton variant="fill" grouped /></div>
      <div className="flex flex-wrap gap-4"><Skeleton variant="stat-tile" grouped /><Skeleton variant="stat-tile" grouped /></div>
      <Skeleton variant="settings" rows={3} grouped />
    </> : <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="habit-row" grouped />)}
    </div>}
  </div>
}
