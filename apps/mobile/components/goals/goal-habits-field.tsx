import { IconButton } from '@/components/ui/icon-button'
import { SPACING } from '@orbit/shared/theme'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { lazy, Suspense, useState } from 'react'
import { Plus, X, RefreshCw } from '@/components/ui/icons'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { GoalHabitsSelectionNote } from './goal-habits-selection-note'
import { createGoalHabitPicker, type GoalHabitsFieldProps, type GoalHabitsPickerProps } from '@orbit/shared/hooks'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { useHabits } from '@/hooks/use-habit-queries'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PickerRow } from '@/components/ui/picker-row'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'

const { CreateHabitModal, useGoalHabitCreation } = createGoalHabitPicker({
  useState: useAccountScopedState, getAccountGeneration, useHabits: () => useHabits({}),
  loadModule: () => import('@/components/habits/create-habit-modal'), lazy,
})

function GoalHabitRow({ habit, selectedIds, onChange, disabled }: Readonly<GoalHabitsFieldProps & { habit: NormalizedHabit }>) {
  const tokens = useThemeTokens()
  const selected = selectedIds.includes(habit.id)
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  return <PickerRow name={habit.title} selected={selected} disabled={disabled || (!selected && atLimit)} onToggle={() => onChange(toggleSelectedId(selectedIds, habit.id))} value={selected ? '✓' : ''} valueHidden valueStyle={{ flex: 1, color: tokens.fg2 }} />
}

function GoalHabitList({ items, selectedIds, onChange, disabled, onClose, onCreateHabit, openingHabitForm }: Readonly<GoalHabitsFieldProps & { items: NormalizedHabit[]; onClose: () => void; onCreateHabit: () => void; openingHabitForm: boolean }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const [query, setQuery] = useState('')
  const filtered = items.filter((habit) => habit.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const renderHabit = ({ item }: { item: NormalizedHabit }) => <GoalHabitRow habit={item} selectedIds={selectedIds} onChange={onChange} disabled={disabled} />
  return <View style={styles.list}>
    {items.length >= 8 ? <Text style={[styles.count, { color: tokens.fg3 }]}>{t('habits.form.availableCount', { count: items.length })}</Text> : null}
    {items.length >= 21 ? <BottomSheetAppTextInput value={query} onChangeText={setQuery} accessibilityLabel={t('goals.form.searchHabits')} placeholder={t('goals.form.searchHabits')} /> : null}
    {items.length === 0 ? <EmptyState title={t('goals.form.habitsInvitation')} action={<IconButton label={t('habits.createHabit')} disabled={disabled || openingHabitForm} loading={openingHabitForm} onClick={onCreateHabit}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /> : null}
    {items.length >= 21 ? <KeyboardAwareFlatList key={query} data={filtered} renderItem={renderHabit} keyExtractor={(habit) => habit.id} style={styles.virtualList} initialNumToRender={8} windowSize={5} nestedScrollEnabled keyboardShouldPersistTaps="handled" ListEmptyComponent={<EmptyState title={t('habits.moveParent.noSearchResults')} action={<IconButton label={t('common.close')} onClick={onClose}><X size={20} strokeWidth={1.5} accessible={false} /></IconButton>} />} /> : filtered.map((habit) => <View key={habit.id}>{renderHabit({ item: habit })}</View>)}
  </View>
}

export function GoalHabitsPicker({ selectedIds, goalType, onChange, disabled, onClose }: Readonly<GoalHabitsPickerProps>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const { sheetRef, closeSheet } = useSheetHost()
  const { creatingHabit, setCreatingHabit, habitFormState, openHabitForm, habits, items } = useGoalHabitCreation(closeSheet)
  if (creatingHabit) return <Suspense fallback={null}><CreateHabitModal open onClose={() => setCreatingHabit(false)} /></Suspense>
  return <Sheet ref={sheetRef} open actions={<PillButton onClick={() => closeSheet()}>{t('common.done')}</PillButton>} title={t('goals.linkedHabits')} onClose={onClose} virtualizedBody={items.length >= 21}>
    {habits.isLoading ? <Skeleton variant="settings" rows={3} label={t('common.loading')} /> : habits.isError ? <View accessibilityRole="alert"><Text style={{ color: tokens.fg2 }}>{t('goals.form.habitsError')}</Text><IconButton label={t('common.retry')} onClick={() => void habits.refetch()}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton></View> : <GoalHabitList items={items} selectedIds={selectedIds} onChange={onChange} disabled={disabled} onClose={() => closeSheet()} openingHabitForm={habitFormState === 'loading'} onCreateHabit={() => void openHabitForm()} />}
    {habitFormState === 'error' ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText }}>{t('goals.form.habitFormError')}</Text> : null}
    <GoalHabitsSelectionNote selectedIds={selectedIds} goalType={goalType} />
    {selectedIds.length >= MAX_HABITS_PER_GOAL ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
  </Sheet>
}

const styles = StyleSheet.create({
  list: { flexShrink: 1, gap: 4 },
  count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: SPACING.s8 },
  virtualList: { maxHeight: 320 },
})
