import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { useHabits } from '@/hooks/use-habits'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'
import { PickerRow } from '@/components/ui/picker-row'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'

interface GoalHabitsFieldProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}

function GoalHabitRow({ habit, selectedIds, onChange, disabled }: Readonly<GoalHabitsFieldProps & { habit: NormalizedHabit }>) {
  const tokens = useThemeTokens()
  const selected = selectedIds.includes(habit.id)
  const atLimit = selectedIds.length >= MAX_HABITS_PER_GOAL
  return <PickerRow name={habit.title} selected={selected} disabled={disabled || (!selected && atLimit)} onToggle={() => onChange(toggleSelectedId(selectedIds, habit.id))} value={selected ? '✓' : ''} valueHidden valueStyle={{ flex: 1, color: tokens.fg2 }} />
}

function GoalHabitList({ items, selectedIds, onChange, disabled }: Readonly<GoalHabitsFieldProps & { items: NormalizedHabit[] }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const [query, setQuery] = useState('')
  const filtered = items.filter((habit) => habit.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const renderHabit = ({ item }: { item: NormalizedHabit }) => <GoalHabitRow habit={item} selectedIds={selectedIds} onChange={onChange} disabled={disabled} />
  return <View style={styles.list}>
    {items.length >= 8 ? <Text style={[styles.count, { color: tokens.fg3 }]}>{t('habits.form.availableCount', { count: items.length })}</Text> : null}
    {items.length >= 21 ? <BottomSheetAppTextInput value={query} onChangeText={setQuery} accessibilityLabel={t('goals.form.searchHabits')} placeholder={t('goals.form.searchHabits')} /> : null}
    {items.length === 0 ? <Text style={{ color: tokens.fg2 }}>{t('goals.noLinkedHabits')}</Text> : null}
    {items.length >= 21 ? <KeyboardAwareFlatList key={query} data={filtered} renderItem={renderHabit} keyExtractor={(habit) => habit.id} style={styles.virtualList} initialNumToRender={8} windowSize={5} nestedScrollEnabled keyboardShouldPersistTaps="handled" /> : filtered.map((habit) => <View key={habit.id}>{renderHabit({ item: habit })}</View>)}
  </View>
}

function GoalHabitsPicker({ selectedIds, onChange, disabled, onClose }: Readonly<GoalHabitsFieldProps & { onClose: () => void }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const habits = useHabits({})
  const items = Array.from(habits.data?.habitsById.values() ?? [])
  return <Sheet open title={t('goals.linkedHabits')} onClose={onClose} virtualizedBody={items.length >= 21}>
    {habits.isLoading ? <Text style={{ color: tokens.fg2 }} accessibilityLiveRegion="polite">{t('common.loading')}</Text> : habits.isError ? <View accessibilityRole="alert"><Text style={{ color: tokens.fg2 }}>{t('goals.form.habitsError')}</Text><PillButton variant="ghost" onClick={() => void habits.refetch()}>{t('common.retry')}</PillButton></View> : <GoalHabitList items={items} selectedIds={selectedIds} onChange={onChange} disabled={disabled} />}
    {selectedIds.length >= MAX_HABITS_PER_GOAL ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
  </Sheet>
}

export function GoalHabitsField(props: Readonly<GoalHabitsFieldProps>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return <>
    <ListRow title={t('goals.linkedHabits')} value={t('habits.form.selectedCount', { count: props.selectedIds.length })} placement="column" disabled={props.disabled} onClick={() => setOpen(true)} />
    {open ? <GoalHabitsPicker {...props} onClose={() => setOpen(false)} /> : null}
  </>
}

const styles = StyleSheet.create({
  list: { flexShrink: 1, gap: 4 },
  count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: 8 },
  virtualList: { maxHeight: 320 },
})
