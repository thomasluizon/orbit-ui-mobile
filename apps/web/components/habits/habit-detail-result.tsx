'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useFlag } from '@/hooks/use-flag'

/** What habit detail closes with: a reschedule that was accepted, or a delete that succeeded. */
export type HabitDetailResult = { kind: 'rescheduled'; date: string } | { kind: 'deleted' }

/** The result state of habit detail. It is on only with the guided flows flag; with the flag off each action ends as before. */
export function useHabitDetailResult() {
  const guided = useFlag('orbit_guided_flows')
  const [result, setResult] = useState<HabitDetailResult | null>(null)
  return { guided, result, setResult }
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
