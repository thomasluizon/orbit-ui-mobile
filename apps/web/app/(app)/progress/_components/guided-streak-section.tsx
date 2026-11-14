'use client'

import { useEffect, useId, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  deriveStreakRepairState,
  extractBackendStatus,
  formatStreakRepairDates,
  getStreakRepairErrorMessageKey,
  resolveStreakOrbitLine,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import {
  RepairUnavailableCopy,
  StreakDetails,
  StreakLockedFigures,
  StreakStrip,
  useStreakScreen,
  type StreakScreen,
  type StreakScreenInputs,
} from './progress-streak'
import { ProgressSubscreenLayer } from './progress-subscreen'
import { ProgressSurfaceError } from './progress-surface-error'
import { StreakRepairFlow } from './streak-repair-flow'

function repairStateOf(streak: StreakScreen): StreakRepairState {
  const { freeze, timeZone } = streak
  return deriveStreakRepairState({
    streak: freeze.streakInfo,
    freezesAvailable: freeze.freezesAvailable,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    now: new Date(),
    accountTimeZone: timeZone,
  })
}

/** Orbit at 48 beside one fact. Orbit is Parado in every state of Sequência, the gap included, and the line is absent behind the Pro gate. */
function StreakOrbitRow({ line }: Readonly<{ line: string | null }>) {
  return (
    <div data-streak-orbit="" className="flex min-h-12 items-center gap-3">
      <span aria-hidden="true" className="flex w-12 shrink-0 justify-center"><OrbitMascot size={48} state="parado" /></span>
      {line ? <p data-streak-orbit-line="" className="min-w-0 flex-1 text-base leading-6 text-[var(--fg-2)]">{line}</p> : null}
    </div>
  )
}

/** The return path of a gap, on the screen: the repair action, or why the gap cannot be repaired. */
function StreakGapActions({ state, repair, onRepair }: Readonly<{
  state: StreakRepairState
  repair: StreakScreen['repair']
  onRepair: () => void
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const status = extractBackendStatus(repair.error)
  if (!state.showGap) return null
  return (
    <div data-streak-repair="" className="flex flex-col items-start gap-3 rounded-[12px] bg-[var(--bg-well)] p-4">
      {state.canRepair
        ? <PillButton variant={isDesktop ? 'secondary' : 'primary'} size="sm" onClick={onRepair}>{t('progressScreen.streak.repairAction', { dates: formatStreakRepairDates(state.dates, locale) })}</PillButton>
        : <RepairUnavailableCopy state={state} />}
      {repair.isError && status !== 409 ? <p role="alert" className="text-[14px] text-[var(--status-bad-text)]">{t(getStreakRepairErrorMessageKey(status))}</p> : null}
    </div>
  )
}

/** The flow stays open while the gap can still be repaired. A refreshed streak with no gap closes it. */
function useRepairFlow(state: StreakRepairState, repair: StreakScreen['repair']) {
  const [open, setOpen] = useAccountScopedState(false)
  const [repairedCount, setRepairedCount] = useAccountScopedState<number | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const repairable = state.showGap && state.canRepair
  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus() })
  }
  useEffect(() => {
    if (open && !repair.isPending && !repairable && repairedCount === null) setOpen(false)
  }, [open, repair.isPending, repairable, repairedCount, setOpen])
  return {
    open,
    repairedCount,
    start: () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      repair.reset()
      setOpen(true)
    },
    close,
    repaired: (count: number) => { setOpen(false); setRepairedCount(count) },
    dismissResult: () => setRepairedCount(null),
  }
}

/** Sequência under `orbit_guided_flows`: Orbit states the streak, and a gap shows its return path on the screen. */
export function GuidedStreakSection(inputs: StreakScreenInputs) {
  const headingId = useId()
  const t = useTranslations()
  const streak = useStreakScreen(inputs)
  const repairState = repairStateOf(streak)
  const flow = useRepairFlow(repairState, streak.repair)
  if (inputs.canView && streak.freeze.streakQuery.isError) return <ProgressSurfaceError onRetry={() => void streak.freeze.streakQuery.refetch()} />
  const freeze = streak.freeze
  const line = inputs.canView && freeze.streakInfo ? resolveStreakOrbitLine({
    repair: repairState,
    currentStreak: streak.currentStreak,
    banked: freeze.streakFreezesAccumulated,
    ceiling: freeze.maxStreakFreezesAccumulated,
    daysUntilNextFreeze: freeze.daysUntilNextFreeze,
  }) : null
  return (
    <section aria-labelledby={headingId} aria-busy={streak.loading} data-progress-streak-summary="" data-progress-guided="" className="flex w-full flex-col gap-4"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
      <StreakOrbitRow line={line ? t(line.key, line.values) : null} />
      <StreakStrip streak={streak} />
      {inputs.canView && freeze.streakInfo ? <StreakGapActions state={repairState} repair={streak.repair} onRepair={flow.start} /> : null}
      {inputs.canView ? <StreakDetails streak={streak} repairOnScreen /> : <StreakLockedFigures longestStreak={streak.longestStreak} currentStreak={streak.currentStreak} />}
      {flow.open ? <ProgressSubscreenLayer><StreakRepairFlow state={repairState} repair={streak.repair} onClose={flow.close} onRepaired={flow.repaired} /></ProgressSubscreenLayer> : null}
      {flow.repairedCount !== null ? <ResultDialog title={t('result.title')} sentence={t('result.streak.repaired', { count: flow.repairedCount })} primaryLabel={t('result.streak.see')} onPrimary={flow.dismissResult} onClose={flow.dismissResult} /> : null}
    </section>
  )
}
