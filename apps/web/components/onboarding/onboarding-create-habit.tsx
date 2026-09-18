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
  title: string
  emoji: string
  schedule: OnboardingSchedule
  proposed: boolean
  correcting: boolean
  atLimit: boolean
  allowance: number
  onCorrect: () => void
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

function EmphasizedCadence({ text, emphasis }: Readonly<{ text: string; emphasis: string }>) {
  const start = text.indexOf(emphasis)
  if (start < 0) return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{text}</p>
  return <p className="text-[17px] leading-[1.4] text-[var(--fg-2)]">{text.slice(0, start)}<strong className="font-medium text-[var(--fg-1)]">{emphasis}</strong>{text.slice(start + emphasis.length)}</p>
}

type CadenceTranslate = ReturnType<typeof useTranslations>
interface CadencePresentation { text: string; emphasis: string }

function cadenceKey(base: 'once' | 'daily' | 'fixed', time: string): string {
  return `cadence.${time ? `${base}At` : base}`
}

function getIntervalCadence(schedule: OnboardingSchedule, days: string, t: CadenceTranslate): CadencePresentation {
  const time = schedule.dueTime
  const count = days ? schedule.intervalWeeks : (schedule.frequencyQuantity ?? 1)
  const unit = days ? 'week' : (schedule.frequencyUnit ?? 'Day').toLowerCase()
  const key = days ? (time ? 'cadence.intervalDaysAt' : 'cadence.intervalDays') : `cadence.${time ? 'intervalUnitAt' : 'intervalUnit'}.${unit}`
  return { text: t(key, { count, days, time }), emphasis: time || String(count) }
}

function getCadencePresentation(schedule: OnboardingSchedule, t: CadenceTranslate): CadencePresentation {
  const time = schedule.dueTime
  if (schedule.isFlexible) {
    const count = schedule.frequencyQuantity ?? 1
    const unit = (schedule.frequencyUnit ?? 'Week').toLowerCase()
    return { text: t(`cadence.${time ? 'flexibleAt' : 'flexible'}.${unit}`, { count, time }), emphasis: String(count) }
  }
  if (schedule.frequencyUnit === null && !schedule.isGeneral) return { text: t(cadenceKey('once', time), { time }), emphasis: time }
  if (schedule.days.length === DAYS.length && schedule.intervalWeeks === 1) return { text: t(cadenceKey('daily', time), { time }), emphasis: time }
  const days = joinDays(schedule.days, (day) => t(`daysLong.${day.toLowerCase()}`), t('cadence.and'))
  if (days && schedule.intervalWeeks === 1) return { text: t(cadenceKey('fixed', time), { days, time }), emphasis: time }
  return getIntervalCadence(schedule, days, t)
}

function CadenceSentence({ schedule }: Readonly<{ schedule: OnboardingSchedule }>) {
  const t = useTranslations('onboarding.flow.when')
  const presentation = getCadencePresentation(schedule, t)
  return <EmphasizedCadence {...presentation} />
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
  const intervalCount = schedule.frequencyQuantity ?? 1
  const intervalUnit = (schedule.frequencyUnit ?? 'Week').toLowerCase()
  const proposalCadence = getCadencePresentation(schedule, useTranslations('onboarding.flow.when'))
  const controls = (
    <div className="flex flex-col gap-4">
      <SegmentedControl label={t('when.scheduleMode')} value={mode} options={[{ value: 'fixed', label: t('when.fixedMode') }, { value: 'flexible', label: t('when.flexibleMode') }, { value: 'interval', label: t('when.intervalMode') }, { value: 'oneTime', label: t('when.oneTimeMode') }]} onChange={props.onModeChange} />
      {mode === 'flexible' ? (
        <><SegmentedControl label={t('when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('when.quantityLess')} moreLabel={t('when.quantityMore')} description={t(`when.quantityUnit.${intervalUnit}`, { count: schedule.frequencyQuantity ?? 1 })} onChange={props.onQuantityChange} /></>
      ) : null}
      {mode === 'fixed' ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--fg-2)]">{t('when.daysLabel')}</span>
          <div className="flex flex-wrap gap-2">{DAYS.map((day) => <Chip key={day} active={schedule.days.includes(day)} ariaLabel={t(`when.daysLong.${day.toLowerCase()}`)} onClick={() => props.onToggleDay(day)}>{t(`when.days.${day.toLowerCase()}`)}</Chip>)}</div>
        </div>
      ) : null}
      {mode === 'interval' ? <><SegmentedControl label={t('when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('when.frequencyLess')} moreLabel={t('when.frequencyMore')} description={t(`when.cadence.intervalUnit.${intervalUnit}`, { count: intervalCount })} onChange={props.onQuantityChange} /></> : null}
      {mode === 'fixed' ? <Stepper value={schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('when.intervalLess')} moreLabel={t('when.intervalMore')} description={t('when.interval', { count: schedule.intervalWeeks })} onChange={props.onIntervalWeeksChange} /> : null}
      <TimeField label={t('when.timeLabel')} value={schedule.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('when.timeHint')} />
    </div>
  )
  return <section className="flex flex-col gap-6">
    <div className="flex items-start gap-3">{props.proposed ? <span className="grid h-[26px] w-5 shrink-0 place-items-center text-[var(--fg-3)]"><AstraGlyph size={18} color="currentColor" /></span> : null}<h1 id="onboarding-title" className="m-0 min-w-0 flex-1 text-pretty text-[17px] font-normal leading-[1.5] text-[var(--fg-1)]">{props.proposed ? t('when.astraRead') : t('when.direct')}</h1></div>
    {props.atLimit ? <CapacityNotice message={t('when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <><button type="button" aria-label={t('when.correctSchedule')} aria-describedby="onboarding-proposal-details" className="group w-full rounded-[20px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.99]" onClick={props.onCorrect}><Proposed proposed scope="block" label={t('when.proposedBy')}><div className="flex flex-col gap-4 rounded-[20px] p-6 transition-colors group-hover:bg-[var(--bg-hover)]"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-[12px] bg-[var(--bg-well)] text-2xl">{props.emoji}</span><strong className="text-[15px] font-medium text-[var(--fg-1)]">{props.title}</strong></div><CadenceSentence schedule={schedule} />{schedule.days.length ? <div className="flex flex-wrap gap-2" aria-label={t('when.daysLabel')}>{DAYS.map((day) => <span key={day} title={t(`when.daysLong.${day.toLowerCase()}`)} className={`grid size-9 place-items-center rounded-full text-xs ${schedule.days.includes(day) ? 'bg-[var(--bg-well)] text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}`}>{t(`when.days.${day.toLowerCase()}`)}</span>)}</div> : null}<div className="flex flex-col gap-2"><span className="text-sm font-medium text-[var(--fg-2)]">{t('when.timeLabel')}</span><span className="rounded-[12px] bg-[var(--bg-field)] px-4 py-3 text-base text-[var(--fg-1)]">{schedule.dueTime || '--:--'}</span><span className="text-xs text-[var(--fg-2)]">{t('when.timeHint')}</span></div></div></Proposed></button><span id="onboarding-proposal-details" className="sr-only">{t('when.scheduleDetails', { title: props.title, cadence: proposalCadence.text, time: schedule.dueTime || t('when.anyTime') })}</span></> : controls}
  </section>
}
