
import { ActionRow } from '@/components/ui/action-row'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useHabitDetailFieldsState } from '@/hooks/use-habit-detail-fields-state'
import type { HabitDetailPatch, ReminderChanges } from '@orbit/shared/hooks'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { buildHabitDetailSchedulePatch, buildHabitDetailTimePatch, canInlineEditHabitSchedule, formatHabitReminderLabel, HABIT_DETAIL_FREQUENCY_UNITS, HABIT_DETAIL_WEEKDAYS, toggleHabitDaySelection } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_GOALS_PER_HABIT } from '@orbit/shared/validation'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { createTokensV2 } from '@/lib/theme'
import { Input } from '@/components/ui/input'
import { X } from '@/components/ui/icons'
import { DateField } from '@/components/ui/date-field'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { HabitDetailTags } from './habit-detail-tags'
import { GoalLinkingField } from './goal-linking-field'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

type Tokens = ReturnType<typeof createTokensV2>

interface HabitDetailFieldsProps {
  open?: boolean
  habit: NormalizedHabit
  hasProAccess: boolean
  relationshipControlsAvailable: boolean
  onItemsChange: (items: NormalizedHabit['checklistItems']) => void
  tokens: Tokens
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>
  onUpgrade: () => void
}

function FieldWell({ children, tokens }: Readonly<{ children: React.ReactNode; tokens: Tokens }>) {
  return <View style={[styles.fieldWell, { backgroundColor: tokens.bgField, borderColor: tokens.hairline }]}>{children}</View>
}

function FieldActions({ onCancel, onSave }: Readonly<{ onCancel: () => void; onSave: () => void }>) {
  const { t } = useTranslation()
  return <View style={styles.actions}><ActionRow><PillButton variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</PillButton><PillButton variant="secondary" size="sm" onClick={onSave}>{t('common.save')}</PillButton></ActionRow></View>
}

function FrequencyUnitOption({ label, selected, tokens, onSelect }: Readonly<{ label: string; selected: boolean; tokens: Tokens; onSelect: () => void }>) {
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({ disabled: false, onSelect, selected })
  return <Pressable {...navigationProps} ref={elementRef} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} style={({ pressed }) => [styles.chip, { borderColor: selected ? tokens.primary : tokens.hairline, backgroundColor: pressed ? tokens.bgHover : selected ? tokens.primaryDim : tokens.bgWell }]} onPress={onActivate}><Text numberOfLines={1} style={[styles.chipText, { color: tokens.fg1 }]}>{label}</Text></Pressable>
}

function FrequencyUnitChips({ unit, tokens, onChange }: Readonly<{ unit: (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]; tokens: Tokens; onChange: (unit: (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]) => void }>) {
  const { t } = useTranslation()
  return <RadioGroup accessibilityLabel={t('habits.detail.schedule')} style={styles.chips}>{HABIT_DETAIL_FREQUENCY_UNITS.map((value) => <FrequencyUnitOption key={value} label={t(`habits.form.unit${value}`)} selected={unit === value} tokens={tokens} onSelect={() => onChange(value)} />)}</RadioGroup>
}

function WeekdayChips({ days, tokens, onChange }: Readonly<{ days: string[]; tokens: Tokens; onChange: (days: string[]) => void }>) {
  const { t } = useTranslation()
  const toggle = (day: string) => onChange(toggleHabitDaySelection(days, day, HABIT_DETAIL_WEEKDAYS, days.length === 0))
  return <View style={styles.days}>{HABIT_DETAIL_WEEKDAYS.map((day) => { const selected = days.length === 0 || days.includes(day); return <Pressable key={day} accessibilityRole="button" accessibilityLabel={t(`dates.daysLong.${day.toLowerCase()}`)} accessibilityState={{ selected }} style={({ pressed }) => [styles.dayChip, { borderWidth: selected ? 1.5 : 1, borderColor: selected ? tokens.primary : tokens.hairline, backgroundColor: pressed ? tokens.bgHover : selected ? tokens.primaryDim : tokens.bgWell }]} onPress={() => toggle(day)}><Text style={[styles.chipText, { color: tokens.fg1 }]}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</Text></Pressable> })}</View>
}

function ScheduleEditor({ habit, tokens, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; tokens: Tokens; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const [unit, setUnit] = useState<(typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(String(habit.frequencyQuantity ?? 1))
  const [days, setDays] = useState(habit.days)
  const [quantityFocused, setQuantityFocused] = useState(false)
  return (
    <FieldWell tokens={tokens}>
      <TextInput value={quantity} keyboardType="number-pad" accessibilityLabel={t('habits.form.frequencyRequired')} style={[styles.quantity, { backgroundColor: tokens.bg, borderColor: quantityFocused ? tokens.primary : tokens.borderControl, borderWidth: quantityFocused ? 2 : 1, color: tokens.fg1 }]} onChangeText={setQuantity} onFocus={() => setQuantityFocused(true)} onBlur={() => setQuantityFocused(false)} />
      <FrequencyUnitChips unit={unit} tokens={tokens} onChange={setUnit} />
      {unit === 'Day' && Number(quantity) === 1 ? <WeekdayChips days={days} tokens={tokens} onChange={setDays} /> : null}
      <FieldActions onCancel={onCancel} onSave={() => { const patch = buildHabitDetailSchedulePatch(unit, Number(quantity), days); if (patch) onSave(patch); else showError(t('habits.form.frequencyRequired')) }} />
    </FieldWell>
  )
}

export function HabitDetailSchedule({ habit, summary, open, tokens, onToggle, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; summary: string; open: boolean; tokens: Tokens; onToggle: () => void; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const { t } = useTranslation()
  const editable = canInlineEditHabitSchedule(habit)
  if (!editable && !summary) return null
  const dailyPills = !open && editable && habit.frequencyUnit === 'Day' && habit.frequencyQuantity === 1 ? <View style={styles.list}><WeekdayChips days={habit.days} tokens={tokens} onChange={(days) => { const patch = buildHabitDetailSchedulePatch('Day', 1, days); if (patch) onSave(patch) }} /></View> : null
  return <><ListRow inset={false} title={t('habits.detail.schedule')} expanded={editable ? open : undefined} controls={editable ? 'habit-detail-schedule-editor' : undefined} value={summary} readOnly={!editable} onClick={editable ? onToggle : undefined} />{dailyPills}{open ? <ScheduleEditor habit={habit} tokens={tokens} onCancel={onCancel} onSave={onSave} /> : null}</>
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const { t } = useTranslation()
  if (!habit.isBadHabit) return null
  return <ListRow inset={false} title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}


export function HabitDetailFields({ open = true, habit, hasProAccess, relationshipControlsAvailable, onItemsChange, onPatch, onUpgrade, tokens }: Readonly<HabitDetailFieldsProps>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const { goalIds, openField, reminderHabit, toggleField, toggleGoal, updateReminders } = useHabitDetailFieldsState(habit, onPatch)
  const [description, setDescription] = useState(habit.description ?? '')
  const [savedDescription, setSavedDescription] = useState(habit.description ?? '')
  if ((habit.description ?? '') !== savedDescription) {
    setSavedDescription(habit.description ?? '')
    if (description === savedDescription) setDescription(habit.description ?? '')
  }

  if (!open) return null

  const changeReminders = (changes: ReminderChanges) => {
    const validationError = updateReminders(changes)
    if (validationError) showError(t(validationError))
  }
  return (
    <View style={styles.fields}>
      <TimeField commitTypedClearOnBlur label={t('habits.form.exactTime')} hint={t('habits.form.anyTimeHint')} value={(habit.dueTime ?? '') as Time24 | ''} onChange={(time) => { const patch = buildHabitDetailTimePatch(time, habit); if (patch) void onPatch(patch) }} onClear={() => { const patch = buildHabitDetailTimePatch('', habit); if (patch) void onPatch(patch) }} />
      <View style={{ gap: 8 }}>
        {!habit.dueTime ? <FormSectionLabel>{t('habits.form.reminders')}</FormSectionLabel> : null}
        {habit.dueTime ? <ReminderSection inline tokens={tokens} reminderEnabled={reminderHabit.reminderEnabled} reminderTimes={reminderHabit.reminderTimes} onReminderTimesChange={(offsets) => changeReminders({ offsets })} onToggleReminder={() => changeReminders({ enabled: !reminderHabit.reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} scheduledReminderCount={reminderHabit.scheduledReminders.length} onValidationError={showError}>
          <ScheduledReminderSection inline tokens={tokens} reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => changeReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => changeReminders({ scheduled })} onValidationError={showError} offsetReminderCount={reminderHabit.reminderTimes.length} nested />
        </ReminderSection> : <ScheduledReminderSection inline tokens={tokens} reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => changeReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => changeReminders({ scheduled })} onValidationError={showError} />}
      </View>
      <View style={{ gap: 8 }}>
        <FormSectionLabel>{t('habits.form.checklist')}</FormSectionLabel>
        <HabitChecklist items={habit.checklistItems} editable onItemsChange={onItemsChange} />
        <ChecklistTemplates items={habit.checklistItems} onLoad={onItemsChange} />
      </View>
      {!habit.isGeneral ? <View>
        <Switch label={t('habits.form.habitTypeAvoid')} checked={habit.isBadHabit} onChange={(isBadHabit) => { void onPatch({ isBadHabit }) }} />
        <Text style={[styles.chipText, { color: tokens.fg3 }]}>{t('habits.form.habitTypeAvoidHint')}</Text>
      </View> : null}
      {relationshipControlsAvailable ? <SlipAlertRow habit={habit} hasProAccess={hasProAccess} onPatch={onPatch} onUpgrade={onUpgrade} /> : null}
      {relationshipControlsAvailable ? <HabitDetailTags habit={habit} /> : null}
      {relationshipControlsAvailable ? <><ListRow inset={false} title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => toggleField('goals')} />{openField === 'goals' ? <FieldWell tokens={tokens}><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={goalIds.length >= MAX_GOALS_PER_HABIT} onToggleGoal={toggleGoal} /></FieldWell> : null}</> : null}
      <View style={{ gap: 8 }}>
        <FormSectionLabel>{t('habits.form.endDate')}</FormSectionLabel>
        <DateField label={t('habits.form.endDate')} value={habit.endDate ?? ''} placeholder={t('habits.form.endDatePlaceholder')} onChange={(endDate) => { void onPatch({ endDate: endDate || null }) }} />
        {habit.endDate ? <PillButton variant="ghost" size="sm" iconOnly label={t('habits.form.removeEndDate')} onClick={() => { void onPatch({ endDate: null }) }}><X size={20} color={tokens.fg1} /></PillButton> : null}
      </View>
      <Input label={t('habits.form.description')} value={description} onChange={setDescription} onBlur={() => { if (description.trim() !== (habit.description ?? '')) void onPatch({ description: description.trim() }) }} multiline rows={3} maxLength={10000} />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  fields: { gap: 24 },
  fieldWell: { gap: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  input: { borderRadius: 12, borderWidth: 1, fontFamily: 'Geist_400Regular', fontSize: 16, minHeight: 48, paddingHorizontal: 12, paddingVertical: 12 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  quantity: { borderRadius: 12, borderWidth: 1, fontFamily: 'Geist_400Regular', fontSize: 16, minHeight: 48, paddingHorizontal: 12, width: 72 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, overflow: 'hidden', borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  dayChip: { alignItems: 'center', borderRadius: 999, overflow: 'hidden', borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  chipText: { fontFamily: 'Geist_500Medium', fontSize: 13 },
})
