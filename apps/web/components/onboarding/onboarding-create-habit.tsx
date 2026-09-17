'use client'

import { useTranslations } from 'next-intl'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import type { OnboardingSchedule } from '@orbit/shared/utils'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Minus, Plus } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TimeField } from '@/components/ui/time-field'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
type ScheduleMode = 'fixed' | 'flexible'

interface OnboardingCreateHabitProps {
  emoji: string
  schedule: OnboardingSchedule
  proposed: boolean
  correcting: boolean
  atLimit: boolean
  allowance: number
  onCorrect: () => void
  onEmojiChange: (value: string) => void
  onToggleDay: (day: string) => void
  onTimeChange: (value: string) => void
  onModeChange: (mode: ScheduleMode) => void
  onQuantityChange: (quantity: number) => void
  onIntervalWeeksChange: (intervalWeeks: number) => void
}

function joinDays(days: string[], label: (day: string) => string, conjunction: string): string {
  const labels = days.map(label)
  if (labels.length < 2) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels.at(-1)}`
}

function CadenceSentence({ schedule }: Readonly<{ schedule: OnboardingSchedule }>) {
  const t = useTranslations('onboarding.flow.when')
  const time = schedule.dueTime
  if (schedule.isFlexible) {
    return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]"><strong className="font-medium text-[var(--fg-1)]">{schedule.frequencyQuantity ?? 1}</strong>{t('cadence.flex')}{time ? <>{t('cadence.flexAt')}<strong className="font-medium text-[var(--fg-1)]">{time}</strong></> : null}</p>
  }
  if (schedule.days.length === DAYS.length) {
    return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.daily')}{time ? <>{t('cadence.at')}<strong className="font-medium text-[var(--fg-1)]">{time}</strong></> : null}</p>
  }
  const days = joinDays(schedule.days, (day) => t(`daysLong.${day.toLowerCase()}`), t('cadence.and'))
  return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.fixed', { days })}{time ? <>{t('cadence.at')}<strong className="font-medium text-[var(--fg-1)]">{time}</strong></> : null}</p>
}

interface StepperProps {
  value: number
  minimum: number
  maximum?: number
  lessLabel: string
  moreLabel: string
  description: string
  onChange: (value: number) => void
}

function Stepper({ value, minimum, maximum, lessLabel, moreLabel, description, onChange }: Readonly<StepperProps>) {
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" aria-label={lessLabel} disabled={value <= minimum} className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onChange(Math.max(minimum, value - 1))}><Minus size={20} strokeWidth={2} aria-hidden="true" /></button>
    <span className="min-w-7 text-center font-mono text-xl tabular-nums">{value}</span>
    <button type="button" aria-label={moreLabel} disabled={maximum !== undefined && value >= maximum} className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onChange(maximum === undefined ? value + 1 : Math.min(maximum, value + 1))}><Plus size={20} strokeWidth={2} aria-hidden="true" /></button>
    <span className="text-sm text-[var(--fg-3)]">{description}</span>
  </div>
}

export function OnboardingCreateHabit(props: Readonly<OnboardingCreateHabitProps>) {
  const t = useTranslations('onboarding.flow')
  const { schedule } = props
  const controls = (
    <div className="flex flex-col gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      <label className="flex flex-col gap-2 text-sm font-medium text-[var(--fg-2)]">
        {t('when.emojiLabel')}
        <input className="min-h-[54px] w-20 rounded-[12px] bg-[var(--bg-field)] px-4 text-2xl shadow-[inset_0_0_0_1px_var(--border-control)]" value={props.emoji} maxLength={4} onChange={(event) => props.onEmojiChange(event.target.value)} />
      </label>
      <SegmentedControl label={t('when.scheduleMode')} value={schedule.isFlexible ? 'flexible' : 'fixed'} options={[{ value: 'fixed', label: t('when.fixedMode') }, { value: 'flexible', label: t('when.flexibleMode') }]} onChange={props.onModeChange} />
      {schedule.isFlexible ? (
        <Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('when.quantityLess')} moreLabel={t('when.quantityMore')} description={t('when.quantityUnit', { count: schedule.frequencyQuantity ?? 1 })} onChange={props.onQuantityChange} />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--fg-2)]">{t('when.daysLabel')}</span>
          <div className="flex flex-wrap gap-2">{DAYS.map((day) => <Chip key={day} active={schedule.days.includes(day)} onClick={() => props.onToggleDay(day)}>{t(`when.days.${day.toLowerCase()}`)}</Chip>)}</div>
        </div>
      )}
      <Stepper value={schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('when.intervalLess')} moreLabel={t('when.intervalMore')} description={t('when.interval', { count: schedule.intervalWeeks })} onChange={props.onIntervalWeeksChange} />
      <TimeField label={t('when.timeLabel')} value={schedule.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('when.timeHint')} />
    </div>
  )
  return <section className="flex flex-col gap-6">
    <div className="flex items-start gap-3">{props.proposed ? <span className="grid h-[26px] w-5 shrink-0 place-items-center text-[var(--fg-3)]"><AstraGlyph size={18} color="currentColor" /></span> : null}<h1 id="onboarding-title" className="m-0 min-w-0 flex-1 text-pretty text-[17px] font-normal leading-[1.5] text-[var(--fg-1)]">{props.proposed ? t('when.astraRead') : t('when.direct')}</h1></div>
    {props.atLimit ? <CapacityNotice message={t('when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <button type="button" className="w-full text-left" onClick={props.onCorrect}><Proposed proposed scope="block" label={t('when.proposedBy')}><div className="flex flex-col gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"><span className="text-3xl text-[var(--fg-3)]">{props.emoji}</span><CadenceSentence schedule={schedule} /></div></Proposed></button> : controls}
  </section>
}
