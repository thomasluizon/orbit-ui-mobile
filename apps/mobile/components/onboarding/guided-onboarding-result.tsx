import { useTranslation } from 'react-i18next'
import { describeSavedOnboardingResult, formatLocaleDate, formatWeekdaySchedule, getAccountDay, getClientTimeZone, type OnboardingSavedHabit } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useHabitDetail } from '@/hooks/use-habit-queries'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

interface GuidedOnboardingResultProps {
  /** The id the create returned: a habit of the account, or the position of the habit that waits on this device before sign-in. */
  habitId: string | null
  /** The facts the create request sent. A create made offline is queued with a temporary id, so the optimistic record answers until the server record exists. */
  optimistic: OnboardingSavedHabit
  /** Before sign-in the filled action signs in, because the habit waits on this device for the account. */
  signedOut: boolean
  timeZone: string | null | undefined
  onPrimary: () => void
  onClose: () => void
}

/** The saved habit, read back: the query cache of the account, the optimistic record of a queued create, or the stored habit that waits for the account. Never the draft. */
function useSavedOnboardingHabit(habitId: string | null, signedOut: boolean, optimistic: OnboardingSavedHabit): OnboardingSavedHabit | undefined {
  const queued = habitId?.startsWith('offline-') ?? false
  const { data: accountHabit } = useHabitDetail(signedOut || queued ? null : habitId)
  const waitingHabit = useOnboardingDraftStore((state) => (signedOut && habitId !== null ? state.habits[Number(habitId)] : undefined))
  if (signedOut) return waitingHabit
  return queued ? optimistic : accountHabit
}

/** The result dialog of the first habit: Orbit in Feliz with the first-run hop, `Pronto!`, and one sentence from the saved habit. It opens only once the saved habit is there. */
export function GuidedOnboardingResult({ habitId, optimistic, signedOut, timeZone, onPrimary, onClose }: Readonly<GuidedOnboardingResultProps>) {
  const { t, i18n } = useTranslation()
  const { displayTime } = useTimeFormat()
  const saved = useSavedOnboardingHabit(habitId, signedOut, optimistic)
  if (!saved) return null
  const { sentence, cadence, schedule, start } = describeSavedOnboardingResult(saved, getAccountDay(new Date(), timeZone ?? getClientTimeZone()))
  const date = formatLocaleDate(start, i18n.language)
  const days = formatWeekdaySchedule(schedule.days, i18n.language, t, schedule.days.length > 1 || schedule.intervalWeeks > 1)
  const text = t(sentence.key, {
    date,
    start: date,
    time: displayTime(schedule.dueTime),
    cadence: cadence ? t(cadence.key, { count: cadence.count, days }) : '',
  })
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={text}
      primaryLabel={t(signedOut ? 'onboarding.flow.done.signIn' : 'result.seeToday')}
      onPrimary={onPrimary}
      onClose={onClose}
    />
  )
}
