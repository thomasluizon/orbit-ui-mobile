import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
interface Props { title: string; emoji: string; schedule: OnboardingSchedule; proposed: boolean; correcting: boolean; atLimit: boolean; allowance: number; onCorrect: () => void; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void; onModeChange: (mode: OnboardingScheduleMode) => void; onFrequencyUnitChange: (unit: FrequencyUnit) => void; onQuantityChange: (quantity: number) => void; onIntervalWeeksChange: (intervalWeeks: number) => void }

function joinDays(days: string[], label: (day: string) => string, conjunction: string): string {
  const labels = days.map(label)
  if (labels.length < 2) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels.at(-1)}`
}

function EmphasizedCadence({ text, emphasis, color, strongColor }: Readonly<{ text: string; emphasis: string; color: string; strongColor: string }>) {
  const start = text.indexOf(emphasis)
  if (start < 0) return <Text style={[styles.sentence, { color }]}>{text}</Text>
  return <Text style={[styles.sentence, { color }]}>{text.slice(0, start)}<Text style={[styles.emphasis, { color: strongColor }]}>{emphasis}</Text>{text.slice(start + emphasis.length)}</Text>
}

type CadenceTranslate = ReturnType<typeof useTranslation>['t']
interface CadencePresentation { text: string; emphasis: string }

function cadenceKey(base: 'once' | 'daily' | 'fixed', time: string): string {
  return time ? `${base}At` : base
}

function getIntervalCadence(schedule: OnboardingSchedule, days: string, t: CadenceTranslate): CadencePresentation {
  const time = schedule.dueTime
  const count = days ? schedule.intervalWeeks : (schedule.frequencyQuantity ?? 1)
  const unit = days ? 'week' : (schedule.frequencyUnit ?? 'Day').toLowerCase()
  const key = days ? (time ? 'intervalDaysAt' : 'intervalDays') : `${time ? 'intervalUnitAt' : 'intervalUnit'}.${unit}`
  return { text: t(`onboarding.flow.when.cadence.${key}`, { count, days, time }), emphasis: time || String(count) }
}

function getCadencePresentation(schedule: OnboardingSchedule, t: CadenceTranslate): CadencePresentation {
  const time = schedule.dueTime
  if (schedule.isFlexible) {
    const count = schedule.frequencyQuantity ?? 1
    const unit = (schedule.frequencyUnit ?? 'Week').toLowerCase()
    return { text: t(`onboarding.flow.when.cadence.${time ? 'flexibleAt' : 'flexible'}.${unit}`, { count, time }), emphasis: String(count) }
  }
  if (schedule.frequencyUnit === null && !schedule.isGeneral) return { text: t(`onboarding.flow.when.cadence.${cadenceKey('once', time)}`, { time }), emphasis: time }
  if (schedule.days.length === DAYS.length && schedule.intervalWeeks === 1) return { text: t(`onboarding.flow.when.cadence.${cadenceKey('daily', time)}`, { time }), emphasis: time }
  const days = joinDays(schedule.days, (day) => t(`onboarding.flow.when.daysLong.${day.toLowerCase()}`), t('onboarding.flow.when.cadence.and'))
  if (days && schedule.intervalWeeks === 1) return { text: t(`onboarding.flow.when.cadence.${cadenceKey('fixed', time)}`, { days, time }), emphasis: time }
  return getIntervalCadence(schedule, days, t)
}

function CadenceSentence({ schedule, color, emphasis }: Readonly<{ schedule: OnboardingSchedule; color: string; emphasis: string }>) {
  const { t } = useTranslation()
  const presentation = getCadencePresentation(schedule, t)
  return <EmphasizedCadence {...presentation} color={color} strongColor={emphasis} />
}

interface StepperProps { value: number; minimum: number; maximum?: number; lessLabel: string; moreLabel: string; description: string; colors: { fg1: string; fg2: string; fg3: string; bgWell: string; hairline: string }; onChange: (value: number) => void }
function Stepper({ value, minimum, maximum, lessLabel, moreLabel, description, colors, onChange }: Readonly<StepperProps>) {
  return <View style={styles.stepper}>
    <Pressable accessibilityRole="button" accessibilityLabel={lessLabel} disabled={value <= minimum} style={[styles.stepButton, { backgroundColor: colors.bgWell, borderColor: colors.hairline }, value <= minimum ? styles.disabled : null]} onPress={() => onChange(Math.max(minimum, value - 1))}><Minus size={20} strokeWidth={2} color={colors.fg2} /></Pressable>
    <Text style={[styles.quantity, { color: colors.fg1 }]}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={moreLabel} disabled={maximum !== undefined && value >= maximum} style={[styles.stepButton, { backgroundColor: colors.bgWell, borderColor: colors.hairline }, maximum !== undefined && value >= maximum ? styles.disabled : null]} onPress={() => onChange(maximum === undefined ? value + 1 : Math.min(maximum, value + 1))}><Plus size={20} strokeWidth={2} color={colors.fg2} /></Pressable>
    <Text style={[styles.description, { color: colors.fg3 }]}>{description}</Text>
  </View>
}

export function OnboardingCreateHabit(props: Readonly<Props>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const { schedule } = props
  const mode = getOnboardingScheduleMode(schedule)
  const frequencyUnitOptions = [
    { value: 'Day', label: t('onboarding.flow.when.units.day') },
    { value: 'Week', label: t('onboarding.flow.when.units.week') },
    { value: 'Month', label: t('onboarding.flow.when.units.month') },
    { value: 'Year', label: t('onboarding.flow.when.units.year') },
  ] as const
  const intervalCount = schedule.frequencyQuantity ?? 1
  const intervalUnit = (schedule.frequencyUnit ?? 'Week').toLowerCase()
  const proposalCadence = getCadencePresentation(schedule, t)
  const controls = <View style={[styles.controls, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
    <SegmentedControl label={t('onboarding.flow.when.scheduleMode')} value={mode} options={[{ value: 'fixed', label: t('onboarding.flow.when.fixedMode') }, { value: 'flexible', label: t('onboarding.flow.when.flexibleMode') }, { value: 'interval', label: t('onboarding.flow.when.intervalMode') }, { value: 'oneTime', label: t('onboarding.flow.when.oneTimeMode') }]} onChange={props.onModeChange} />
    {mode === 'flexible' ? <><SegmentedControl label={t('onboarding.flow.when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('onboarding.flow.when.quantityLess')} moreLabel={t('onboarding.flow.when.quantityMore')} description={t(`onboarding.flow.when.quantityUnit.${intervalUnit}`, { count: schedule.frequencyQuantity ?? 1 })} colors={tokens} onChange={props.onQuantityChange} /></> : null}
    {mode === 'fixed' ? <><Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.daysLabel')}</Text><View style={styles.days}>{DAYS.map((day) => <Chip key={day} active={schedule.days.includes(day)} accessibilityLabel={t(`onboarding.flow.when.daysLong.${day.toLowerCase()}`)} onPress={() => props.onToggleDay(day)}>{t(`onboarding.flow.when.days.${day.toLowerCase()}`)}</Chip>)}</View></> : null}
    {mode === 'interval' ? <><SegmentedControl label={t('onboarding.flow.when.frequencyUnitLabel')} value={schedule.frequencyUnit ?? 'Week'} options={frequencyUnitOptions} onChange={props.onFrequencyUnitChange} /><Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('onboarding.flow.when.frequencyLess')} moreLabel={t('onboarding.flow.when.frequencyMore')} description={t(`onboarding.flow.when.cadence.intervalUnit.${intervalUnit}`, { count: intervalCount })} colors={tokens} onChange={props.onQuantityChange} /></> : null}
    {mode === 'fixed' ? <Stepper value={schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('onboarding.flow.when.intervalLess')} moreLabel={t('onboarding.flow.when.intervalMore')} description={t('onboarding.flow.when.interval', { count: schedule.intervalWeeks })} colors={tokens} onChange={props.onIntervalWeeksChange} /> : null}
    <TimeField label={t('onboarding.flow.when.timeLabel')} value={schedule.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('onboarding.flow.when.timeHint')} />
  </View>
  return <View style={styles.root}>
    <View style={styles.intro}>{props.proposed ? <AstraGlyph size={18} color={tokens.fg3} /> : null}<Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(props.proposed ? 'onboarding.flow.when.astraRead' : 'onboarding.flow.when.direct')}</Text></View>
    {props.atLimit ? <CapacityNotice message={t('onboarding.flow.when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.flow.when.correctSchedule')} accessibilityHint={t('onboarding.flow.when.scheduleDetails', { title: props.title, cadence: proposalCadence.text, time: schedule.dueTime || t('onboarding.flow.when.anyTime') })} onPress={props.onCorrect} style={({ pressed }) => pressed ? styles.proposalPressed : undefined}><Proposed proposed scope="block" label={t('onboarding.flow.when.proposedBy')}><View style={[styles.proposal, { backgroundColor: tokens.bgCard }]}><View style={styles.proposalTitle}><View style={[styles.proposalEmojiWell, { backgroundColor: tokens.bgWell }]}><Text style={styles.proposalEmoji}>{props.emoji}</Text></View><Text style={[styles.proposalHabit, { color: tokens.fg1 }]}>{props.title}</Text></View><CadenceSentence schedule={schedule} color={tokens.fg2} emphasis={tokens.fg1} />{schedule.days.length ? <View accessibilityLabel={t('onboarding.flow.when.daysLabel')} style={styles.previewDays}>{DAYS.map((day) => <View key={day} style={[styles.previewDay, schedule.days.includes(day) ? { backgroundColor: tokens.bgWell } : null]}><Text style={[styles.previewDayText, { color: schedule.days.includes(day) ? tokens.fg1 : tokens.fg3 }]}>{t(`onboarding.flow.when.days.${day.toLowerCase()}`)}</Text></View>)}</View> : null}<View style={styles.previewTime}><Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.timeLabel')}</Text><View style={[styles.previewTimeWell, { backgroundColor: tokens.bgField }]}><Text style={[styles.previewTimeText, { color: tokens.fg1 }]}>{schedule.dueTime || '--:--'}</Text></View><Text style={[styles.previewHint, { color: tokens.fg2 }]}>{t('onboarding.flow.when.timeHint')}</Text></View></View></Proposed></Pressable> : controls}
  </View>
}

const styles = StyleSheet.create({ root: { gap: 24 }, intro: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 }, title: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26 }, controls: { borderRadius: 20, borderWidth: 1, gap: 16, padding: 24 }, label: { fontFamily: 'Geist_500Medium', fontSize: 14 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, proposal: { borderRadius: 20, gap: 16, padding: 24 }, proposalPressed: { transform: [{ scale: 0.99 }] }, proposalTitle: { alignItems: 'center', flexDirection: 'row', gap: 12 }, proposalEmojiWell: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 }, proposalEmoji: { fontSize: 24 }, proposalHabit: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 15 }, previewDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, previewDay: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, previewDayText: { fontFamily: 'Geist_400Regular', fontSize: 12 }, previewTime: { gap: 8 }, previewTimeWell: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }, previewTimeText: { fontFamily: 'Geist_400Regular', fontSize: 16 }, previewHint: { fontFamily: 'Geist_400Regular', fontSize: 12 }, sentence: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24 }, emphasis: { fontFamily: 'Geist_500Medium' }, stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stepButton: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, quantity: { fontFamily: 'GeistMono_500Medium', fontSize: 20, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }, description: { fontFamily: 'Geist_400Regular', fontSize: 14 }, disabled: { opacity: 0.4 } })
