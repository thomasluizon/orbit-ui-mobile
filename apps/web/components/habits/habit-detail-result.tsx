'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useFlag } from '@/hooks/use-flag'

/** What habit detail closes with: a reschedule that was accepted, or a delete that succeeded. */
export type HabitDetailResult = { kind: 'rescheduled'; date: string } | { kind: 'deleted' }

/**
 * The result state of habit detail and the endings of its two flows. `seeToday` goes to Hoje on the day of the habit.
 * With the guided flows on, an accepted reschedule and a delete close with the result dialog, and the delete dialog leaves to Hoje however it closes.
 * With the flag off, each action ends as before: a delete goes to Hoje at once and a reschedule shows nothing.
 */
export function useHabitDetailResult(seeToday: () => void) {
  const guided = useFlag('orbit_guided_flows')
  const [result, setResult] = useState<HabitDetailResult | null>(null)
  const leave = () => {
    setResult(null)
    seeToday()
  }
  return {
    result,
    deleted: () => { if (guided) setResult({ kind: 'deleted' }); else seeToday() },
    rescheduled: (date: string) => { if (guided) setResult({ kind: 'rescheduled', date }) },
    seeToday: leave,
    close: () => { if (result?.kind === 'deleted') leave(); else setResult(null) },
  }
}

/** What habit detail shows when it has no habit to draw. Right after a delete the detail read is already removed, so the deleted result dialog shows there, and the load error shows in every other case. */
export function HabitDetailUnavailable({ result, onSeeToday, onClose, children }: Readonly<{ result: HabitDetailResult | null; onSeeToday: () => void; onClose: () => void; children: ReactNode }>) {
  return result?.kind === 'deleted' ? <HabitDetailResultDialog result={result} onSeeToday={onSeeToday} onClose={onClose} /> : children
}

/** The centred result dialog of habit detail. After a delete Orbit is Parado and does not hop, because nothing was created or finished. */
export function HabitDetailResultDialog({ result, onSeeToday, onClose }: Readonly<{ result: HabitDetailResult | null; onSeeToday: () => void; onClose: () => void }>) {
  const t = useTranslations()
  if (!result) return null
  return <ResultDialog
    title={t('result.title')}
    sentence={result.kind === 'rescheduled' ? t('result.habit.rescheduled', { date: result.date }) : t('result.habit.deleted')}
    primaryLabel={t('result.seeToday')}
    onPrimary={onSeeToday}
    onClose={onClose}
    orbitState={result.kind === 'deleted' ? 'parado' : 'feliz'}
  />
}
