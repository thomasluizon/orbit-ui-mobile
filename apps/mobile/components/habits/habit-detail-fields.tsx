import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatHabitReminderLabel, formatLocaleDate } from '@orbit/shared/utils'
import type { NormalizedHabit, UpdateHabitRequest } from '@orbit/shared/types/habit'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { useAppToast } from '@/hooks/use-app-toast'
import { createTokensV2 } from '@/lib/theme'
import { GoalLinkingField } from './goal-linking-field'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

type DetailField = 'goals' | 'reminders' | 'schedule' | 'time' | 'description' | 'endDate'
type HabitPatch = Partial<UpdateHabitRequest>
type Tokens = ReturnType<typeof createTokensV2>

interface HabitDetailFieldsProps {
  habit: NormalizedHabit
  hasProAccess: boolean
  locale: string
  summary: string
  tokens: Tokens
  onPatch: (patch: HabitPatch) => Promise<boolean>
  onUpgrade: () => void
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const FREQUENCY_UNITS = ['Day', 'Week', 'Month', 'Year'] as const

function FieldWell({ children, tokens }: Readonly<{ children: React.ReactNode; tokens: Tokens }>) {
  return <View style={[styles.fieldWell, { backgroundColor: tokens.bgField, borderColor: tokens.hairline }]}>{children}</View>
}

function FieldActions({ onCancel, onSave }: Readonly<{ onCancel: () => void; onSave: () => void }>) {
  const { t } = useTranslation()
  return <View style={styles.actions}><PillButton variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel')}</PillButton><PillButton size="sm" onClick={onSave}>{t('common.save')}</PillButton></View>
}

function TextEditor({ initialValue, multiline = false, tokens, onCancel, onSave }: Readonly<{ initialValue: string; multiline?: boolean; tokens: Tokens; onCancel: () => void; onSave: (value: string) => void }>) {
  const [value, setValue] = useState(initialValue)
  return <FieldWell tokens={tokens}><TextInput autoFocus value={value} multiline={multiline} numberOfLines={multiline ? 4 : 1} style={[styles.input, multiline ? styles.multiline : null, { backgroundColor: tokens.bg, borderColor: tokens.borderControl, color: tokens.fg1 }]} onChangeText={setValue} /><FieldActions onCancel={onCancel} onSave={() => onSave(value.trim())} /></FieldWell>
}

function FrequencyUnitChips({ unit, tokens, onChange }: Readonly<{ unit: (typeof FREQUENCY_UNITS)[number]; tokens: Tokens; onChange: (unit: (typeof FREQUENCY_UNITS)[number]) => void }>) {
  const { t } = useTranslation()
  return <View style={styles.chips}>{FREQUENCY_UNITS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: unit === value }} style={[styles.chip, { borderColor: unit === value ? tokens.primary : tokens.hairline, backgroundColor: unit === value ? tokens.selectionBg : tokens.bg }]} onPress={() => onChange(value)}><Text numberOfLines={1} style={[styles.chipText, { color: tokens.fg1 }]}>{t(`habits.form.unit${value}`)}</Text></Pressable>)}</View>
}

function WeekdayChips({ days, tokens, onChange }: Readonly<{ days: string[]; tokens: Tokens; onChange: (days: string[]) => void }>) {
  const { t } = useTranslation()
  const toggle = (day: string) => onChange(days.includes(day) ? days.filter((value) => value !== day) : [...days, day])
  return <View style={styles.chips}>{WEEKDAYS.map((day) => <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: days.includes(day) }} style={[styles.dayChip, { borderColor: days.includes(day) ? tokens.primary : tokens.hairline, backgroundColor: days.includes(day) ? tokens.selectionBg : tokens.bg }]} onPress={() => toggle(day)}><Text style={[styles.chipText, { color: tokens.fg1 }]}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</Text></Pressable>)}</View>
}

function ScheduleEditor({ habit, tokens, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; tokens: Tokens; onCancel: () => void; onSave: (patch: HabitPatch) => void }>) {
  const { t } = useTranslation()
  const [unit, setUnit] = useState<(typeof FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(String(habit.frequencyQuantity ?? 1))
  const [days, setDays] = useState(habit.days)
  return (
    <FieldWell tokens={tokens}>
      <TextInput value={quantity} keyboardType="number-pad" accessibilityLabel={t('habits.form.frequencyRequired')} style={[styles.quantity, { backgroundColor: tokens.bg, borderColor: tokens.borderControl, color: tokens.fg1 }]} onChangeText={setQuantity} />
      <FrequencyUnitChips unit={unit} tokens={tokens} onChange={setUnit} />
      {unit === 'Day' ? <WeekdayChips days={days} tokens={tokens} onChange={setDays} /> : null}
      <FieldActions onCancel={onCancel} onSave={() => onSave({ frequencyUnit: unit, frequencyQuantity: Math.max(1, Number(quantity)), days: unit === 'Day' ? days : [] })} />
    </FieldWell>
  )
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const { t } = useTranslation()
  if (!habit.isBadHabit) return null
  return <ListRow title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}

export function formatHabitDetailReminderValue(habit: Pick<NormalizedHabit, 'reminderEnabled' | 'reminderTimes' | 'scheduledReminders'>, t: ReturnType<typeof useTranslation>['t']): string {
  if (!habit.reminderEnabled) return t('habits.detail.noValue')
  const values = [...habit.reminderTimes.map((minutes) => formatHabitReminderLabel(minutes, t)), ...habit.scheduledReminders.map((reminder) => reminder.time)]
  return values.length ? values.join(', ') : t('habits.detail.noValue')
}

export function HabitDetailFields({ habit, hasProAccess, locale, summary, tokens, onPatch, onUpgrade }: Readonly<HabitDetailFieldsProps>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const [openField, setOpenField] = useState<DetailField | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(habit.reminderEnabled)
  const [reminderTimes, setReminderTimes] = useState(habit.reminderTimes)
  const [scheduledReminders, setScheduledReminders] = useState(habit.scheduledReminders)
  const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const close = () => setOpenField(null)
  const save = (patch: HabitPatch) => { void onPatch(patch).then((saved) => { if (saved) close() }) }
  const toggleGoal = (goalId: string) => {
    const next = goalIds.includes(goalId) ? goalIds.filter((id) => id !== goalId) : [...goalIds, goalId]
    setGoalIds(next)
    void onPatch({ goalIds: next })
  }
  const updateReminders = (next: { enabled?: boolean; offsets?: number[]; scheduled?: typeof scheduledReminders }) => {
    const enabled = next.enabled ?? reminderEnabled
    const offsets = next.offsets ?? reminderTimes
    const scheduled = next.scheduled ?? scheduledReminders
    setReminderEnabled(enabled)
    setReminderTimes(offsets)
    setScheduledReminders(scheduled)
    void onPatch({ reminderEnabled: enabled, reminderTimes: offsets, scheduledReminders: scheduled })
  }
  const reminderHabit = useMemo(() => ({ ...habit, reminderEnabled, reminderTimes, scheduledReminders }), [habit, reminderEnabled, reminderTimes, scheduledReminders])
  return (
    <View style={styles.list}>
      <ListRow title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'goals' ? null : 'goals')} />
      {openField === 'goals' ? <FieldWell tokens={tokens}><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={false} onToggleGoal={toggleGoal} /></FieldWell> : null}
      <ListRow title={t('habits.detail.reminders')} value={formatHabitDetailReminderValue(reminderHabit, t)} onClick={() => setOpenField(openField === 'reminders' ? null : 'reminders')} />
      {openField === 'reminders' ? <FieldWell tokens={tokens}>{habit.dueTime ? <ReminderSection tokens={tokens} reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={(offsets) => updateReminders({ offsets })} onToggleReminder={() => updateReminders({ enabled: !reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} /> : <ScheduledReminderSection tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} />}</FieldWell> : null}
      <ListRow title={t('habits.detail.schedule')} value={summary} onClick={() => setOpenField(openField === 'schedule' ? null : 'schedule')} />
      {openField === 'schedule' ? <ScheduleEditor habit={habit} tokens={tokens} onCancel={close} onSave={save} /> : null}
      <ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'time' ? null : 'time')} />
      {openField === 'time' ? <TextEditor initialValue={habit.dueTime ?? ''} tokens={tokens} onCancel={close} onSave={(dueTime) => save({ dueTime })} /> : null}
      <ListRow title={t('habits.detail.description')} value={habit.description ?? t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'description' ? null : 'description')} />
      {openField === 'description' ? <TextEditor initialValue={habit.description ?? ''} multiline tokens={tokens} onCancel={close} onSave={(description) => save({ description })} /> : null}
      <ListRow title={t('habits.detail.endDate')} value={habit.endDate ? formatLocaleDate(habit.endDate, locale, { dateStyle: 'medium' }) : t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'endDate' ? null : 'endDate')} />
      {openField === 'endDate' ? <TextEditor initialValue={habit.endDate ?? ''} tokens={tokens} onCancel={close} onSave={(endDate) => save({ endDate: endDate || null })} /> : null}
      <SlipAlertRow habit={habit} hasProAccess={hasProAccess} onPatch={onPatch} onUpgrade={onUpgrade} />
      <ListRow title={t('habits.detail.startedOn')} value={formatLocaleDate(new Date(habit.createdAtUtc), locale, { dateStyle: 'medium' })} readOnly />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  fieldWell: { borderRadius: 12, borderWidth: 1, gap: 12, marginBottom: 12, marginHorizontal: 12, padding: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  input: { borderRadius: 12, borderWidth: 1, fontFamily: 'Geist_400Regular', fontSize: 16, minHeight: 48, paddingHorizontal: 12, paddingVertical: 12 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  quantity: { borderRadius: 12, borderWidth: 1, fontFamily: 'Roboto_400Regular', fontSize: 16, minHeight: 48, paddingHorizontal: 12, width: 72 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 8, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  dayChip: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  chipText: { fontFamily: 'Geist_500Medium', fontSize: 13 },
})
