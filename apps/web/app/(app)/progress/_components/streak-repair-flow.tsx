'use client'

import { useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  extractBackendStatus,
  formatStreakRepairDates,
  getStreakRepairErrorMessageKey,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import type { useRepairStreak } from '@/hooks/use-gamification'
import { captureGuidedFlowCompleted } from '@/lib/posthog'

const REPAIR_STEP = 'repair'

/**
 * The repair as a one-question flow: the question states what the repair does and what it costs, and the quick
 * options are the answers. It sends the same request as the confirm it replaces. An error keeps the flow open.
 */
export function StreakRepairFlow({ state, repair, onClose, onRepaired }: Readonly<{
  state: StreakRepairState
  repair: ReturnType<typeof useRepairStreak>
  onClose: () => void
  onRepaired: (currentStreak: number) => void
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const rootRef = useRef<HTMLDivElement>(null)
  const status = extractBackendStatus(repair.error)
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('[data-question-flow] h1')?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const submit = () => {
    if (repair.isPending) return
    repair.mutate(state.dates, {
      onSuccess: (streakInfo) => {
        captureGuidedFlowCompleted('streak_repair', 1, false)
        onRepaired(streakInfo.currentStreak)
      },
    })
  }
  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <QuestionFlow
        flow="streak_repair"
        stepKey={REPAIR_STEP}
        position={1}
        total={1}
        direction={1}
        question={t('progressScreen.streak.repairFlow.question', { count: state.count })}
        line={t('progressScreen.streak.repairFlow.line', { dates: formatStreakRepairDates(state.dates, locale) })}
        progressLabel={t('habits.flow.progress', { position: 1, total: 1 })}
        backLabel={t('common.back')}
        closeLabel={t('common.close')}
        onClose={onClose}
        statusText={repair.isPending ? t('progressScreen.streak.repairFlow.saving') : undefined}
        options={<>
          <OptionCard label={t('progressScreen.streak.repairFlow.repair')} selected={repair.isPending} onSelect={submit} />
          <OptionCard label={t('progressScreen.streak.repairFlow.notNow')} onSelect={onClose} />
        </>}
      >
        {repair.isError && status !== 409 ? <p role="alert" className="text-center text-[14px] leading-5 text-[var(--status-bad-text)]">{t(getStreakRepairErrorMessageKey(status))}</p> : null}
      </QuestionFlow>
    </div>
  )
}
