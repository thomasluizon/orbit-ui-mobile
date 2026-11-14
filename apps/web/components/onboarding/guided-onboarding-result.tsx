'use client'

import { useLocale, useTranslations } from 'next-intl'
import { describeOnboardingResult, formatLocaleDate, formatWeekdaySchedule, getAccountDay, getClientTimeZone, type OnboardingSchedule } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useTimeFormat } from '@/hooks/use-time-format'

interface GuidedOnboardingResultProps {
  /** The schedule the create request saved. */
  schedule: OnboardingSchedule
  /** Before sign-in the filled action signs in, because the habit waits on this device for the account. */
  signedOut: boolean
  timeZone: string | null | undefined
  onPrimary: () => void
  onClose: () => void
}

/** The result dialog of the first habit: Orbit in Feliz with the first-run hop, `Pronto!`, and one sentence from the saved schedule. */
export function GuidedOnboardingResult({ schedule, signedOut, timeZone, onPrimary, onClose }: Readonly<GuidedOnboardingResultProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const today = getAccountDay(new Date(), timeZone ?? getClientTimeZone())
  const { sentence, cadence } = describeOnboardingResult(schedule, today)
  const date = formatLocaleDate(today, locale)
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
