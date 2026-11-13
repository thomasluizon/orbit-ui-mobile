'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { describeHabitResult, formatLocaleDate, getAccountDay, resolveResultDestination } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useHabitDetail } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'

interface HabitResultDialogProps {
  habitId: string
  change: 'created' | 'updated'
  /** Closes the dialog and the flow behind it. */
  onClose: () => void
  /** Starts a new empty flow. Absent on an edit. */
  onCreateAnother?: () => void
}

/**
 * The result dialog of a saved habit. The sentence names the facts of the saved record, read back from
 * the query cache, never the draft. The dialog opens only once the saved record is there.
 */
export function HabitResultDialog({ habitId, change, onClose, onCreateAnother }: Readonly<HabitResultDialogProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const { data: saved } = useHabitDetail(habitId)
  if (!saved) return null
  const item = {
    itemType: saved.frequencyUnit || saved.isFlexible ? 'habit' as const : 'task' as const,
    isGeneral: saved.isGeneral,
    dueDate: saved.dueDate || null,
    dueTime: saved.dueTime,
    frequencyUnit: saved.frequencyUnit,
    frequencyQuantity: saved.frequencyQuantity,
  }
  const sentence = describeHabitResult(item, change)
  const date = item.dueDate ? formatLocaleDate(item.dueDate, locale) : ''
  const sentenceText = t(sentence.key, {
    date,
    start: date,
    time: displayTime(item.dueTime),
    cadence: sentence.cadence ? t(sentence.cadence.key, { count: sentence.cadence.count }) : '',
  })
  const destination = resolveResultDestination(item, getAccountDay(new Date(), profile?.timeZone))
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={sentenceText}
      primaryLabel={t(destination === 'today' ? 'result.seeToday' : 'result.seeCalendar')}
      onPrimary={() => { onClose(); router.push(destination === 'today' ? '/' : '/calendar') }}
      secondaryLabel={onCreateAnother ? t('result.createAnother') : undefined}
      onSecondary={onCreateAnother}
      onClose={onClose}
    />
  )
}
