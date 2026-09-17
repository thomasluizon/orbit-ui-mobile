import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
type ScheduleMode = 'fixed' | 'flexible'
interface Props { emoji: string; schedule: OnboardingSchedule; proposed: boolean; correcting: boolean; atLimit: boolean; allowance: number; onCorrect: () => void; onEmojiChange: (value: string) => void; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void; onModeChange: (mode: ScheduleMode) => void; onQuantityChange: (quantity: number) => void; onIntervalWeeksChange: (intervalWeeks: number) => void }

function joinDays(days: string[], label: (day: string) => string, conjunction: string): string {
  const labels = days.map(label)
  if (labels.length < 2) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels.at(-1)}`
}

function CadenceSentence({ schedule, color, emphasis }: Readonly<{ schedule: OnboardingSchedule; color: string; emphasis: string }>) {
  const { t } = useTranslation()
  const plain = [styles.sentence, { color }]
  const strong = [styles.emphasis, { color: emphasis }]
  if (schedule.isFlexible) return <Text style={plain}><Text style={strong}>{schedule.frequencyQuantity ?? 1}</Text>{t('onboarding.flow.when.cadence.flex')}{schedule.dueTime ? <>{t('onboarding.flow.when.cadence.flexAt')}<Text style={strong}>{schedule.dueTime}</Text></> : null}</Text>
  if (schedule.days.length === DAYS.length) return <Text style={plain}>{t('onboarding.flow.when.cadence.daily')}{schedule.dueTime ? <>{t('onboarding.flow.when.cadence.at')}<Text style={strong}>{schedule.dueTime}</Text></> : null}</Text>
  const days = joinDays(schedule.days, (day) => t(`onboarding.flow.when.daysLong.${day.toLowerCase()}`), t('onboarding.flow.when.cadence.and'))
  return <Text style={plain}>{t('onboarding.flow.when.cadence.fixed', { days })}{schedule.dueTime ? <>{t('onboarding.flow.when.cadence.at')}<Text style={strong}>{schedule.dueTime}</Text></> : null}</Text>
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
  const controls = <View style={[styles.controls, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
    <Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.emojiLabel')}</Text>
    <TextInput accessibilityLabel={t('onboarding.flow.when.emojiLabel')} value={props.emoji} maxLength={4} onChangeText={props.onEmojiChange} style={[styles.emoji, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl, color: tokens.fg1 }]} />
    <SegmentedControl label={t('onboarding.flow.when.scheduleMode')} value={schedule.isFlexible ? 'flexible' : 'fixed'} options={[{ value: 'fixed', label: t('onboarding.flow.when.fixedMode') }, { value: 'flexible', label: t('onboarding.flow.when.flexibleMode') }]} onChange={props.onModeChange} />
    {schedule.isFlexible ? <Stepper value={schedule.frequencyQuantity ?? 1} minimum={1} lessLabel={t('onboarding.flow.when.quantityLess')} moreLabel={t('onboarding.flow.when.quantityMore')} description={t('onboarding.flow.when.quantityUnit', { count: schedule.frequencyQuantity ?? 1 })} colors={tokens} onChange={props.onQuantityChange} /> : <><Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.daysLabel')}</Text><View style={styles.days}>{DAYS.map((day) => <Chip key={day} active={schedule.days.includes(day)} onPress={() => props.onToggleDay(day)}>{t(`onboarding.flow.when.days.${day.toLowerCase()}`)}</Chip>)}</View></>}
    <Stepper value={schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('onboarding.flow.when.intervalLess')} moreLabel={t('onboarding.flow.when.intervalMore')} description={t('onboarding.flow.when.interval', { count: schedule.intervalWeeks })} colors={tokens} onChange={props.onIntervalWeeksChange} />
    <TimeField label={t('onboarding.flow.when.timeLabel')} value={schedule.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('onboarding.flow.when.timeHint')} />
  </View>
  return <View style={styles.root}>
    <View style={styles.intro}>{props.proposed ? <AstraGlyph size={18} color={tokens.fg3} /> : null}<Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(props.proposed ? 'onboarding.flow.when.astraRead' : 'onboarding.flow.when.direct')}</Text></View>
    {props.atLimit ? <CapacityNotice message={t('onboarding.flow.when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <Pressable accessibilityRole="button" onPress={props.onCorrect}><Proposed proposed scope="block" label={t('onboarding.flow.when.proposedBy')}><View style={[styles.proposal, { backgroundColor: tokens.bgCard }]}><Text style={[styles.proposalEmoji, { color: tokens.fg3 }]}>{props.emoji}</Text><CadenceSentence schedule={schedule} color={tokens.fg2} emphasis={tokens.fg1} /></View></Proposed></Pressable> : controls}
  </View>
}

const styles = StyleSheet.create({ root: { gap: 24 }, intro: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 }, title: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26 }, controls: { borderRadius: 20, borderWidth: 1, gap: 16, padding: 24 }, label: { fontFamily: 'Geist_500Medium', fontSize: 14 }, emoji: { borderRadius: 12, borderWidth: 1, fontSize: 24, minHeight: 54, paddingHorizontal: 16, width: 80 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, proposal: { borderRadius: 20, gap: 16, padding: 24 }, proposalEmoji: { fontSize: 30 }, sentence: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24 }, emphasis: { fontFamily: 'Geist_500Medium' }, stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stepButton: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, quantity: { fontFamily: 'GeistMono_500Medium', fontSize: 20, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }, description: { fontFamily: 'Geist_400Regular', fontSize: 14 }, disabled: { opacity: 0.4 } })
