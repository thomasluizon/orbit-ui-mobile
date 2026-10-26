import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { useHabitFormInteraction } from './habit-form-fields/habit-form-interaction'
import { SPACING } from '@orbit/shared/theme'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PickerRow } from '@/components/ui/picker-row'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Goal, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import type { createTokensV2 } from '@/lib/theme'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'
import { ListRow } from '@/components/ui/list-row'

import { ActionRow } from '@/components/ui/action-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { CreateGoalSheet } from '../goals/create-goal-sheet'
import { createUseGoalLinking, type GoalLinkingFieldProps } from '@orbit/shared/hooks'

const useGoalLinking = createUseGoalLinking(useAccountScopedState)

async function fetchGoals(): Promise<Goal[]> {
  const response = await apiClient<PaginatedGoalResponse | Goal[]>(API.goals.list)
  return Array.isArray(response) ? response : response.items
}

function GoalPickerList({ goals, selectedIds, atLimit, onToggle }: Readonly<{ goals: Goal[]; selectedIds: string[]; atLimit: boolean; onToggle: (id: string) => void }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const [query, setQuery] = useState('')
  const filteredGoals = goals.filter((goal) => goal.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const renderGoal = ({ item: goal }: { item: Goal }) => {
    const selected = selectedIds.includes(goal.id)
    return <PickerRow name={goal.title} selected={selected} disabled={disabled || (!selected && atLimit)} onToggle={() => onToggle(goal.id)} value={selected ? '✓' : `${Math.round(goal.progressPercentage)}%`} valueStyle={styles.rowValue} />
  }
  return <View style={styles.list}>
    {goals.length >= 8 ? <Text style={styles.count}>{t('habits.form.availableCount', { count: goals.length })}</Text> : null}
    {goals.length >= 21 ? <BottomSheetAppTextInput isChangeDisabled={isDisabled} editable={!disabled} accessibilityState={{ disabled }} value={query} onChangeText={guard(setQuery)} accessibilityLabel={t('habits.form.searchGoals')} placeholder={t('habits.form.searchGoals')} style={styles.search} /> : null}
    {goals.length >= 21 ? <KeyboardAwareFlatList key={query} data={filteredGoals} renderItem={renderGoal} keyExtractor={(goal) => goal.id} style={styles.virtualList} initialNumToRender={8} windowSize={5} nestedScrollEnabled keyboardShouldPersistTaps="handled" /> : filteredGoals.map((goal) => <View key={goal.id}>{renderGoal({ item: goal })}</View>)}
  </View>
}

export function GoalLinkingField(props: Readonly<GoalLinkingFieldProps>) {
  const { selectedGoalIds, atGoalLimit, onToggleGoal } = props
  const { disabled } = useHabitFormInteraction()
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { sheetRef, closeSheet } = useSheetHost()
  const { data: goals } = useQuery({ queryKey: goalKeys.lists(), queryFn: fetchGoals, staleTime: QUERY_STALE_TIMES.goals })
  const { open, setOpen, creating, setCreating, activeGoals, selectedGoals,
    openCreateGoal, handleCreated, initialHabitIds } = useGoalLinking(props, goals, closeSheet)

  return (
    <>
      <ListRow disabled={disabled} title={t('habits.form.goals')} value={t('habits.form.selectedCount', { count: selectedGoalIds.length })} placement="column" onClick={() => setOpen(true)} />
      {selectedGoals.length > 0 ? <View style={styles.chips}>{selectedGoals.slice(0, 3).map((goal) => <View key={goal.id} style={styles.chip}><PersonalTextDetails lines={1} textStyle={styles.chipText}>{goal.title}</PersonalTextDetails></View>)}{selectedGoals.length > 3 ? <View style={[styles.chip, { paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s8 }]}><Text style={styles.chipText}>{t('habits.form.moreSelected', { count: selectedGoals.length - 3 })}</Text></View> : null}</View> : null}
      {open ? <Sheet ref={sheetRef} open title={t('habits.form.goals')} virtualizedBody={activeGoals.length >= 21} actions={activeGoals.length ? <ActionRow><IconButton label={t('goals.create')} onClick={openCreateGoal} disabled={disabled || atGoalLimit}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton></ActionRow> : undefined} onClose={() => setOpen(false)}>
        {activeGoals.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{t('habits.form.goalInvitation')}</Text><IconButton label={t('habits.form.createGoal')} onClick={openCreateGoal} disabled={disabled || atGoalLimit}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton></View> : <GoalPickerList goals={activeGoals} selectedIds={selectedGoalIds} atLimit={atGoalLimit} onToggle={onToggleGoal} />}
      </Sheet> : null}
      {creating ? <CreateGoalSheet open initialHabitIds={initialHabitIds} onCreated={handleCreated} onClose={() => setCreating(false)} /> : null}
    </>
  )
}

type Tokens = ReturnType<typeof createTokensV2>
function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: SPACING.s8 },
    chip: { backgroundColor: tokens.bgWell, borderRadius: 8, minWidth: 0, maxWidth: '100%' },
    chipText: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14, flexShrink: 1 },
    list: { flexShrink: 1, gap: 4 }, count: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: SPACING.s8 },
    search: { backgroundColor: tokens.bgField, borderColor: tokens.hairline, borderRadius: 12, borderWidth: 1, color: tokens.fg1, marginBottom: SPACING.s8, minHeight: 54, paddingHorizontal: SPACING.s16 },
    virtualList: { maxHeight: 320 },
    rowValue: { flex: 1, color: tokens.fg2, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    empty: { alignItems: 'center', gap: 16, padding: SPACING.s32 }, emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' },
  })
}
