import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useHabitDetailFieldsState, type HabitDetailPatch } from '@orbit/shared/hooks'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { buildHabitDetailSchedulePatch, buildHabitDetailTimePatch, canInlineEditHabitSchedule, formatHabitDetailReminderValue, formatHabitReminderLabel, formatLocaleDate, HABIT_DETAIL_FREQUENCY_UNITS, HABIT_DETAIL_WEEKDAYS } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_GOALS_PER_HABIT } from '@orbit/shared/validation'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { useAppToast } from '@/hooks/use-app-toast'
import { createTokensV2 } from '@/lib/theme'
import { GoalLinkingField } from './goal-linking-field'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

type Tokens = ReturnType<typeof createTokensV2>

interface HabitDetailFieldsProps {
  habit: NormalizedHabit
  hasProAccess: boolean
  locale: string
  summary: string
  tokens: Tokens
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>
  onUpgrade: () => void
}

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

function TimeEditor({ habit, tokens, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; tokens: Tokens; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const { t } = useTranslation()
  const [dueTime, setDueTime] = useState<Time24 | ''>((habit.dueTime ?? '') as Time24 | '')
  return <FieldWell tokens={tokens}><TimeField label={t('habits.detail.time')} value={dueTime} onChange={setDueTime} onClear={() => setDueTime('')} /><FieldActions onCancel={onCancel} onSave={() => { const patch = buildHabitDetailTimePatch(dueTime, habit); if (patch) onSave(patch) }} /></FieldWell>
}

function FrequencyUnitChips({ unit, tokens, onChange }: Readonly<{ unit: (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]; tokens: Tokens; onChange: (unit: (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]) => void }>) {
  const { t } = useTranslation()
  return <View style={styles.chips}>{HABIT_DETAIL_FREQUENCY_UNITS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: unit === value }} style={[styles.chip, { borderColor: unit === value ? tokens.primary : tokens.hairline, backgroundColor: unit === value ? tokens.selectionBg : tokens.bg }]} onPress={() => onChange(value)}><Text numberOfLines={1} style={[styles.chipText, { color: tokens.fg1 }]}>{t(`habits.form.unit${value}`)}</Text></Pressable>)}</View>
}

function WeekdayChips({ days, tokens, onChange }: Readonly<{ days: string[]; tokens: Tokens; onChange: (days: string[]) => void }>) {
  const { t } = useTranslation()
  const toggle = (day: string) => onChange(days.includes(day) ? days.filter((value) => value !== day) : [...days, day])
  return <View style={styles.chips}>{HABIT_DETAIL_WEEKDAYS.map((day) => <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: days.includes(day) }} style={[styles.dayChip, { borderColor: days.includes(day) ? tokens.primary : tokens.hairline, backgroundColor: days.includes(day) ? tokens.selectionBg : tokens.bg }]} onPress={() => toggle(day)}><Text style={[styles.chipText, { color: tokens.fg1 }]}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</Text></Pressable>)}</View>
}

function ScheduleEditor({ habit, tokens, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; tokens: Tokens; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const [unit, setUnit] = useState<(typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(String(habit.frequencyQuantity ?? 1))
  const [days, setDays] = useState(habit.days)
  return (
    <FieldWell tokens={tokens}>
      <TextInput value={quantity} keyboardType="number-pad" accessibilityLabel={t('habits.form.frequencyRequired')} style={[styles.quantity, { backgroundColor: tokens.bg, borderColor: tokens.borderControl, color: tokens.fg1 }]} onChangeText={setQuantity} />
      <FrequencyUnitChips unit={unit} tokens={tokens} onChange={setUnit} />
      {unit === 'Day' && Number(quantity) === 1 ? <WeekdayChips days={days} tokens={tokens} onChange={setDays} /> : null}
      <FieldActions onCancel={onCancel} onSave={() => { const patch = buildHabitDetailSchedulePatch(unit, Number(quantity), days); if (patch) onSave(patch); else showError(t('habits.form.frequencyRequired')) }} />
    </FieldWell>
  )
}

function ScheduleField({ habit, summary, open, tokens, onToggle, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; summary: string; open: boolean; tokens: Tokens; onToggle: () => void; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const { t } = useTranslation()
  const editable = canInlineEditHabitSchedule(habit)
  return <><ListRow title={t('habits.detail.schedule')} value={summary} readOnly={!editable} onClick={editable ? onToggle : undefined} />{open ? <ScheduleEditor habit={habit} tokens={tokens} onCancel={onCancel} onSave={onSave} /> : null}</>
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const { t } = useTranslation()
  if (!habit.isBadHabit) return null
  return <ListRow title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}

export function HabitDetailFields({ habit, hasProAccess, locale, summary, tokens, onPatch, onUpgrade }: Readonly<HabitDetailFieldsProps>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const fields = useHabitDetailFieldsState(habit, onPatch)
  const { cancelReminders, close, goalIds, openField, reminderHabit, save, saveReminders, toggleField, toggleGoal, updateReminders } = fields
  const saveReminderDraft = () => {
    const validationError = saveReminders()
    if (validationError) showError(t(validationError))
  }
  return (
    <View style={styles.list}>
      <ListRow title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => toggleField('goals')} />
      {openField === 'goals' ? <FieldWell tokens={tokens}><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={goalIds.length >= MAX_GOALS_PER_HABIT} onToggleGoal={toggleGoal} /></FieldWell> : null}
      <ListRow title={t('habits.detail.reminders')} value={formatHabitDetailReminderValue(reminderHabit, t)} onClick={() => toggleField('reminders')} />
      {openField === 'reminders' ? <FieldWell tokens={tokens}>{habit.dueTime ? <ReminderSection tokens={tokens} reminderEnabled={reminderHabit.reminderEnabled} reminderTimes={reminderHabit.reminderTimes} onReminderTimesChange={(offsets) => updateReminders({ offsets })} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} /> : null}{!habit.dueTime || reminderHabit.scheduledReminders.length > 0 ? <ScheduledReminderSection tokens={tokens} reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} nested={Boolean(habit.dueTime)} /> : null}<FieldActions onCancel={cancelReminders} onSave={saveReminderDraft} /></FieldWell> : null}
      <ScheduleField habit={habit} summary={summary} open={openField === 'schedule'} tokens={tokens} onToggle={() => toggleField('schedule')} onCancel={close} onSave={save} />
      <ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => toggleField('time')} />
      {openField === 'time' ? <TimeEditor habit={habit} tokens={tokens} onCancel={close} onSave={save} /> : null}
      <ListRow title={t('habits.detail.description')} value={habit.description ?? t('habits.detail.noValue')} onClick={() => toggleField('description')} />
      {openField === 'description' ? <TextEditor initialValue={habit.description ?? ''} multiline tokens={tokens} onCancel={close} onSave={(description) => save({ description })} /> : null}
      <ListRow title={t('habits.detail.endDate')} value={habit.endDate ? formatLocaleDate(habit.endDate, locale, { dateStyle: 'medium' }) : t('habits.detail.noValue')} onClick={() => toggleField('endDate')} />
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
