import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
  habitId: string | null
  optimistic: OnboardingSavedHabit
  signedOut: boolean
  timeZone: string | null | undefined
  onPrimary: () => void
  onClose: () => void
}

interface SavedOnboardingHabitRead {
  saved: OnboardingSavedHabit | undefined
  failed: boolean
  retrying: boolean
  retry: () => void
}

function useSavedOnboardingHabit(habitId: string | null, signedOut: boolean, optimistic: OnboardingSavedHabit): SavedOnboardingHabitRead {
  const queued = habitId?.startsWith('offline-') ?? false
  const account = useHabitDetail(signedOut || queued ? null : habitId)
  const waitingHabit = useOnboardingDraftStore((state) => (signedOut && habitId !== null ? state.habits[Number(habitId)] : undefined))
  if (signedOut) {
    return { saved: waitingHabit, failed: habitId !== null && waitingHabit === undefined, retrying: false, retry: () => { void useOnboardingDraftStore.persist.rehydrate() } }
  }
  if (queued) return { saved: optimistic, failed: false, retrying: false, retry: () => {} }
  return { saved: account.data, failed: account.data === undefined && account.isError, retrying: account.isFetching, retry: () => { void account.refetch() } }
}

function OnboardingResultReadError({ retrying, onRetry, onClose }: Readonly<{ retrying: boolean; onRetry: () => void; onClose: () => void }>) {
  const { t } = useTranslation()
  const message = t('onboarding.flow.done.readFailed')
  return (
    <ResultDialogFrame label={message} testID="onboarding-result-error" onClose={onClose}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={128} state="parado" /></View>
      <ErrorState message={message} action={
        <IconButton label={t('common.retry')} loading={retrying} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      } />
    </ResultDialogFrame>
  )
}

/**
 * The result dialog of the first habit: Orbit in Feliz with the first-run hop, `Pronto!`, and one sentence from the saved habit.
 * It opens only once the saved habit is there. A read that fails states the miss with a retry.
 */
export function GuidedOnboardingResult({ habitId, optimistic, signedOut, timeZone, onPrimary, onClose }: Readonly<GuidedOnboardingResultProps>) {
  const { t, i18n } = useTranslation()
  const { displayTime } = useTimeFormat()
  const { saved, failed, retrying, retry } = useSavedOnboardingHabit(habitId, signedOut, optimistic)
  if (failed) return <OnboardingResultReadError retrying={retrying} onRetry={retry} onClose={onClose} />
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
