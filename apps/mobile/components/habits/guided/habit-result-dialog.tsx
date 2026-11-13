import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { describeHabitResult, type HabitResultItem, formatLocaleDate, getAccountDay, resolveResultDestination } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useHabitDetail } from '@/hooks/use-habit-queries'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'

interface HabitResultDialogProps {
  habitId: string
  change: 'created' | 'updated'
  /** Closes the dialog and the flow behind it. */
  onClose: () => void
  /** The facts the draft saved. A create made offline is queued with a temporary id, so the optimistic record answers until the server record exists. */
  optimistic?: HabitResultItem
  /** Starts a new empty flow. Absent on an edit. */
  onCreateAnother?: () => void
}

/**
 * The result dialog of a saved habit. The sentence names the facts of the saved record, read back from
 * the query cache, never the draft. The dialog opens only once the saved record is there.
 */
export function HabitResultDialog({ habitId, change, optimistic, onClose, onCreateAnother }: Readonly<HabitResultDialogProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const router = useRouter()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const queued = habitId.startsWith('offline-')
  const { data: saved } = useHabitDetail(queued ? null : habitId)
  const item: HabitResultItem | null = saved ? {
    itemType: saved.frequencyUnit || saved.isFlexible ? 'habit' : 'task',
    isGeneral: saved.isGeneral,
    dueDate: saved.dueDate || null,
    dueTime: saved.dueTime,
    frequencyUnit: saved.frequencyUnit,
    frequencyQuantity: saved.frequencyQuantity,
  } : optimistic ?? null
  if (!item) return null
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
      onPrimary={() => { onClose(); router.push(destination === 'today' ? '/(tabs)' : '/(tabs)/calendar') }}
      secondaryLabel={onCreateAnother ? t('result.createAnother') : undefined}
      onSecondary={onCreateAnother}
      onClose={onClose}
    />
  )
}
