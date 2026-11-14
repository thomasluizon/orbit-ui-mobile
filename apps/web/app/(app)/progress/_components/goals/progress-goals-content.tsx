'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import type { ProgressGoalFilter } from '@orbit/shared/utils'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useFlag } from '@/hooks/use-flag'
import { useGoals } from '@/hooks/use-goals'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { ProgressLoading } from '../progress-loading'
import { ProgressSubscreen } from '../progress-subscreen'
import { GoalsSection } from './goals-section'
import { useGoalSeenProgress } from './use-goal-seen-progress'

/** The empty goals list: Orbit at rest at the state size, the title and one action. */
function GoalsEmptyState({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const t = useTranslations()
  const isDesktop = useIsDesktop()
  return <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant={isDesktop ? 'secondary' : 'primary'} size="sm" onClick={onCreate}>{t('progressScreen.goals.createAction')}</PillButton>} />
}

function focusGoalCard(container: HTMLElement | null, goalId: string) {
  const card = Array.from(container?.querySelectorAll<HTMLElement>('[data-goal-id]') ?? []).find((element) => element.dataset.goalId === goalId)
  ;(card ?? container?.querySelector<HTMLElement>('[data-progress-focus]'))?.focus()
}

function useGoalFocusReturn(container: RefObject<HTMLDivElement | null>, creating: boolean, createdGoalId: string | null, detailGoalId: string | null) {
  const openingGoalId = useRef<string | null>(null)
  useEffect(() => {
    if (creating || !createdGoalId) return
    focusGoalCard(container.current, createdGoalId)
  }, [container, creating, createdGoalId])
  useEffect(() => {
    if (detailGoalId) { openingGoalId.current = detailGoalId; return }
    const previousGoal = openingGoalId.current
    if (!previousGoal) return
    focusGoalCard(container.current, previousGoal)
    openingGoalId.current = null
  }, [container, detailGoalId])
}

export function ProgressGoalsContent() {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const [goalFilter, setGoalFilter] = useAccountScopedState<ProgressGoalFilter>('all')
  const [creating, setCreating] = useAccountScopedState(false)
  const [createdGoalId, setCreatedGoalId] = useAccountScopedState<string | null>(null)
  const [detailGoalId, setDetailGoalId] = useAccountScopedState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useGoalFocusReturn(contentRef, creating, createdGoalId, detailGoalId)
  const openCreateGoal = () => { setCreatedGoalId(null); setCreating(true) }

  const goals = useGoals()
  const allGoals = goals.data?.allGoals ?? []
  const error = goals.isError
  const loading = !error && goals.isLoading
  const empty = !loading && !error && allGoals.length === 0
  const seen = useGoalSeenProgress(allGoals, guided, !reducedMotion)
  const retry = () => { void goals.refetch() }
  return (
    <div ref={contentRef} className="mx-auto flex w-full min-w-0 max-w-[740px] flex-1 flex-col">
      {creating ? <CreateGoalSheet open restoreFocusOnCreate={false} onCreated={(goalId) => { setGoalFilter('all'); setCreatedGoalId(goalId) }} onOpenGoal={(goalId) => { setCreatedGoalId(null); setDetailGoalId(goalId) }} onClose={() => setCreating(false)} /> : null}
      {detailGoalId ? <div className="px-screen-gutter pt-4"><GoalDetailDrawer key={detailGoalId} inline open onOpenChange={(open) => { if (!open) setDetailGoalId(null) }} goalId={detailGoalId} /></div> : null}
      <div hidden={detailGoalId !== null} className="flex w-full flex-1 flex-col">
        <ProgressSubscreen screen="goals" hideHeader={detailGoalId !== null}>
          <p data-progress-focus tabIndex={-1} className="sr-only">{t('progressScreen.sections.goals')}</p>
          {loading ? <ProgressLoading label={t('progressScreen.loading')} screen="goals" /> : null}
          {error ? <div className="w-full"><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} /></div> : null}
          {empty ? <ShellCentredRegion><GoalsEmptyState onCreate={openCreateGoal} /></ShellCentredRegion> : null}
          {!loading && !error && !empty ? <GoalsSection filter={goalFilter} setFilter={setGoalFilter} onCreate={openCreateGoal} onOpenGoal={setDetailGoalId} goals={allGoals} sweepFrom={seen.sweepFrom} /> : null}
        </ProgressSubscreen>
      </div>
    </div>
  )
}
