'use client'

import { useLocale, useTranslations } from 'next-intl'
import { describeSavedOnboardingResult, formatLocaleDate, formatWeekdaySchedule, getAccountDay, getClientTimeZone, type OnboardingSavedHabit } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { ResultDialog, ResultDialogFrame } from '@/components/ui/result-dialog'
import { useHabitDetail } from '@/hooks/use-habit-queries'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

interface GuidedOnboardingResultProps {
  /** The id the create returned: a habit of the account, or the position of the habit that waits on this device before sign-in. */
  habitId: string | null
  /** Before sign-in the filled action signs in, because the habit waits on this device for the account. */
  signedOut: boolean
  timeZone: string | null | undefined
  onPrimary: () => void
  onClose: () => void
}

interface SavedOnboardingHabitRead {
  saved: OnboardingSavedHabit | undefined
  /** The read ended with no habit: the request failed, or the store does not hold the habit that waits on this device. */
  failed: boolean
  retrying: boolean
  retry: () => void
}

/** The saved habit, read back: the query cache of the account, or the stored habit that waits for the account. Never the draft. */
function useSavedOnboardingHabit(habitId: string | null, signedOut: boolean): SavedOnboardingHabitRead {
  const account = useHabitDetail(signedOut ? null : habitId)
  const waitingHabit = useOnboardingDraftStore((state) => (signedOut && habitId !== null ? state.habits[Number(habitId)] : undefined))
  if (signedOut) {
    return { saved: waitingHabit, failed: habitId !== null && waitingHabit === undefined, retrying: false, retry: () => { void useOnboardingDraftStore.persist.rehydrate() } }
  }
  return { saved: account.data, failed: account.data === undefined && account.isError, retrying: account.isFetching, retry: () => { void account.refetch() } }
}

/** The read of the saved habit failed. The habit exists, so the dialog states that fact and offers the read again. Orbit is Parado after a miss, with no hop. */
function OnboardingResultReadError({ retrying, onRetry, onClose }: Readonly<{ retrying: boolean; onRetry: () => void; onClose: () => void }>) {
  const t = useTranslations()
  const message = t('onboarding.flow.done.readFailed')
  return (
    <ResultDialogFrame label={message} onClose={onClose}>
      <div data-onboarding-result-error="" data-orbit-state="parado" className="flex flex-col items-center px-6 pb-6 pt-2 text-center">
        <span aria-hidden="true"><OrbitMascot size={128} state="parado" /></span>
        <ErrorState message={message} action={
          <IconButton label={t('common.retry')} loading={retrying} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        } />
      </div>
    </ResultDialogFrame>
  )
}

/**
 * The result dialog of the first habit: Orbit in Feliz with the first-run hop, `Pronto!`, and one sentence from the saved habit.
 * It opens only once the saved habit is there. A read that fails states the miss with a retry.
 */
export function GuidedOnboardingResult({ habitId, signedOut, timeZone, onPrimary, onClose }: Readonly<GuidedOnboardingResultProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const { saved, failed, retrying, retry } = useSavedOnboardingHabit(habitId, signedOut)
  if (failed) return <OnboardingResultReadError retrying={retrying} onRetry={retry} onClose={onClose} />
  if (!saved) return null
  const { sentence, cadence, schedule, start } = describeSavedOnboardingResult(saved, getAccountDay(new Date(), timeZone ?? getClientTimeZone()))
  const date = formatLocaleDate(start, locale)
  const days = formatWeekdaySchedule(schedule.days, locale, t, schedule.days.length > 1 || schedule.intervalWeeks > 1)
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
