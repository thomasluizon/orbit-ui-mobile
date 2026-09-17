'use client'

import { useTranslations } from 'next-intl'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { MAX_HABIT_INTERVAL_WEEKS, type FrequencyUnit } from '@orbit/shared/types/habit'
import { getOnboardingScheduleMode, type OnboardingSchedule, type OnboardingScheduleMode } from '@orbit/shared/utils'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Minus, Plus } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TimeField } from '@/components/ui/time-field'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
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
  onModeChange: (mode: OnboardingScheduleMode) => void
  onFrequencyUnitChange: (unit: FrequencyUnit) => void
  onQuantityChange: (quantity: number) => void
  onIntervalWeeksChange: (intervalWeeks: number) => void
}

function joinDays(days: string[], label: (day: string) => string, conjunction: string): string {
  const labels = days.map(label)
  if (labels.length < 2) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels.at(-1)}`
}

function CadenceTime({ time, at }: Readonly<{ time: string; at: string }>) {
  if (!time) return null
  return <>{at}<strong className="font-medium text-[var(--fg-1)]">{time}</strong></>
}

function IntervalCadence({
  schedule,
  days,
}: Readonly<{
  schedule: OnboardingSchedule
  days: string
}>) {
  const t = useTranslations('onboarding.flow.when')
  const unit = days ? 'week' : (schedule.frequencyUnit ?? 'Day').toLowerCase()
  const count = days ? schedule.intervalWeeks : (schedule.frequencyQuantity ?? 1)
  const countPrefix = count > 1 ? <><strong className="font-medium text-[var(--fg-1)]">{count}</strong>{' '}</> : null
  const daysSuffix = days ? t('cadence.onDays', { days }) : null
  const unitCount = count === 1 ? 'one' : 'other'
  return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.every')}{countPrefix}{t(`cadence.unit.${unit}.${unitCount}`)}{daysSuffix}<CadenceTime time={schedule.dueTime} at={t('cadence.at')} /></p>
}

function CadenceSentence({ schedule }: Readonly<{ schedule: OnboardingSchedule }>) {
  const t = useTranslations('onboarding.flow.when')
  const time = schedule.dueTime
  if (schedule.isFlexible) {
    const count = schedule.frequencyQuantity ?? 1
    const unit = (schedule.frequencyUnit ?? 'Week').toLowerCase()
    return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]"><strong className="font-medium text-[var(--fg-1)]">{count}</strong>{t(`cadence.flexUnit.${unit}`, { count })}<CadenceTime time={time} at={t('cadence.flexAt')} /></p>
  }
  if (schedule.frequencyUnit === null && !schedule.isGeneral) return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.once')}<CadenceTime time={time} at={t('cadence.at')} /></p>
  if (schedule.days.length === DAYS.length && schedule.intervalWeeks === 1) {
    return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.daily')}<CadenceTime time={time} at={t('cadence.at')} /></p>
  }
  const days = joinDays(schedule.days, (day) => t(`daysLong.${day.toLowerCase()}`), t('cadence.and'))
  if (days && schedule.intervalWeeks === 1) return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{t('cadence.fixed', { days })}<CadenceTime time={time} at={t('cadence.at')} /></p>
  return <IntervalCadence schedule={schedule} days={days} />
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
  const mode = getOnboardingScheduleMode(schedule)
  const frequencyUnitOptions = [
    { value: 'Day', label: t('when.units.day') },
    { value: 'Week', label: t('when.units.week') },
    { value: 'Month', label: t('when.units.month') },
    { value: 'Year', label: t('when.units.year') },
  ] as const
  const controls = (
    <div className="flex flex-col gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      <label className="flex flex-col gap-2 text-sm font-medium text-[var(--fg-2)]">
        {t('when.emojiLabel')}
        <input className="min-h-[54px] w-20 rounded-[12px] bg-[var(--bg-field)] px-4 text-2xl shadow-[inset_0_0_0_1px_var(--border-control)]" value={props.emoji} maxLength={4} onChange={(event) => props.onEmojiChange(event.target.value)} />
      </label>
      <SegmentedControl label={t('when.scheduleMode')} value={mode} options={[{ value: 'fixed', label: t('when.fixedMode') }, { value: 'flexible', label: t('when.flexibleMode') }, { value: 'interval', label: t('when.intervalMode') }, { value: 'oneTime', label: t('when.oneTimeMode') }]} onChange={props.onModeChange} />
      {mode === 'flexible' ? (
        <><SegmentedControl label={t('when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('when.quantityLess')} moreLabel={t('when.quantityMore')} description={t('when.quantityUnit', { count: schedule.frequencyQuantity ?? 1 })} onChange={props.onQuantityChange} /></>
      ) : null}
      {mode === 'fixed' ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--fg-2)]">{t('when.daysLabel')}</span>
          <div className="flex flex-wrap gap-2">{DAYS.map((day) => <Chip key={day} active={schedule.days.includes(day)} ariaLabel={t(`when.daysLong.${day.toLowerCase()}`)} onClick={() => props.onToggleDay(day)}>{t(`when.days.${day.toLowerCase()}`)}</Chip>)}</div>
        </div>
      ) : null}
      {mode === 'interval' ? <><SegmentedControl label={t('when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('when.frequencyLess')} moreLabel={t('when.frequencyMore')} description={`${t('when.cadence.every')}${(schedule.frequencyQuantity ?? 1) > 1 ? `${schedule.frequencyQuantity} ` : ''}${t(`when.cadence.unit.${(schedule.frequencyUnit ?? 'Week').toLowerCase()}.${(schedule.frequencyQuantity ?? 1) === 1 ? 'one' : 'other'}`)}`} onChange={props.onQuantityChange} /></> : null}
      {mode === 'fixed' || mode === 'flexible' ? <Stepper value={schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('when.intervalLess')} moreLabel={t('when.intervalMore')} description={t('when.interval', { count: schedule.intervalWeeks })} onChange={props.onIntervalWeeksChange} /> : null}
      <TimeField label={t('when.timeLabel')} value={schedule.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('when.timeHint')} />
    </div>
  )
  return <section className="flex flex-col gap-6">
    <div className="flex items-start gap-3">{props.proposed ? <span className="grid h-[26px] w-5 shrink-0 place-items-center text-[var(--fg-3)]"><AstraGlyph size={18} color="currentColor" /></span> : null}<h1 id="onboarding-title" className="m-0 min-w-0 flex-1 text-pretty text-[17px] font-normal leading-[1.5] text-[var(--fg-1)]">{props.proposed ? t('when.astraRead') : t('when.direct')}</h1></div>
    {props.atLimit ? <CapacityNotice message={t('when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <button type="button" className="w-full text-left" onClick={props.onCorrect}><Proposed proposed scope="block" label={t('when.proposedBy')}><div className="flex flex-col gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"><span className="text-3xl text-[var(--fg-3)]">{props.emoji}</span><CadenceSentence schedule={schedule} /></div></Proposed></button> : controls}
  </section>
}
