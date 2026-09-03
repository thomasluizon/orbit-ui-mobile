import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Goal, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

async function fetchGoals(): Promise<Goal[]> {
  const response = await apiClient<PaginatedGoalResponse | Goal[]>(API.goals.list)
  return Array.isArray(response) ? response : response.items
}

export function GoalLinkingField({ selectedGoalIds, atGoalLimit, onToggleGoal }: Readonly<GoalLinkingFieldProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { sheetRef, closeSheet } = useSheetHost()
  const setShowCreateGoalModal = useUIStore((state) => state.setShowCreateGoalModal)
  const { data: goals } = useQuery({ queryKey: goalKeys.lists(), queryFn: fetchGoals, staleTime: QUERY_STALE_TIMES.goals })
  const activeGoals = useMemo(() => goals?.filter((goal) => goal.status === 'Active') ?? [], [goals])
  const selectedSet = useMemo(() => new Set(selectedGoalIds), [selectedGoalIds])
  const selectedGoals = activeGoals.filter((goal) => selectedSet.has(goal.id))
  const filteredGoals = activeGoals.filter((goal) => goal.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const openCreateGoal = () => closeSheet(() => {
    setOpen(false)
    setQuery('')
    setShowCreateGoalModal(true)
  })

  const renderGoal = ({ item: goal }: { item: Goal }) => {
    const selected = selectedSet.has(goal.id)
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: !selected && atGoalLimit }} disabled={!selected && atGoalLimit} style={({ pressed }) => [styles.row, !selected && atGoalLimit ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onToggleGoal(goal.id)}>
        <Text numberOfLines={1} style={styles.rowTitle}>{goal.title}</Text>
        <Text style={styles.rowValue}>{selected ? '✓' : `${Math.round(goal.progressPercentage)}%`}</Text>
      </Pressable>
    )
  }

  return (
    <>
      <ListRow inset={false} title={t('habits.form.goals')} value={t('habits.form.selectedCount', { count: selectedGoalIds.length })} onClick={() => setOpen(true)} />
      {selectedGoals.length > 0 ? <View style={styles.chips}>{selectedGoals.slice(0, 3).map((goal) => <View key={goal.id} style={styles.chip}><Text numberOfLines={1} style={styles.chipText}>{goal.title}</Text></View>)}{selectedGoals.length > 3 ? <View style={styles.chip}><Text style={styles.chipText}>{t('habits.form.moreSelected', { count: selectedGoals.length - 3 })}</Text></View> : null}</View> : null}
      {open ? <Sheet ref={sheetRef} open title={t('habits.form.goals')} virtualizedBody={activeGoals.length >= 21} onClose={() => { setOpen(false); setQuery('') }}>
        {activeGoals.length === 0 ? <View style={styles.empty}><Text numberOfLines={1} style={styles.emptyTitle}>{t('habits.form.noGoals')}</Text><Pressable accessibilityRole="button" style={styles.action} onPress={openCreateGoal}><Text numberOfLines={1} style={styles.actionText}>{t('habits.form.createGoal')}</Text></Pressable></View> : <View style={styles.list}>
          {activeGoals.length >= 8 ? <Text style={styles.count}>{t('habits.form.availableCount', { count: activeGoals.length })}</Text> : null}
          {activeGoals.length >= 21 ? <BottomSheetAppTextInput value={query} onChangeText={setQuery} placeholder={t('habits.form.searchGoals')} style={styles.search} /> : null}
          {activeGoals.length >= 21 ? <FlatList data={filteredGoals} renderItem={renderGoal} keyExtractor={(goal) => goal.id} style={styles.virtualList} initialNumToRender={8} windowSize={5} nestedScrollEnabled keyboardShouldPersistTaps="handled" /> : filteredGoals.map((goal) => <View key={goal.id}>{renderGoal({ item: goal })}</View>)}
        </View>}
      </Sheet> : null}
    </>
  )
}

type Tokens = ReturnType<typeof createTokensV2>
function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
    chip: { backgroundColor: tokens.bgWell, borderRadius: 8, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 8 },
    chipText: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 13, flexShrink: 1 },
    list: { gap: 4 }, count: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: 8 },
    search: { backgroundColor: tokens.bgField, borderColor: tokens.hairline, borderRadius: 12, borderWidth: 1, color: tokens.fg1, marginBottom: 8, minHeight: 44, paddingHorizontal: 12 },
    virtualList: { maxHeight: 360 },
    row: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 12, minHeight: 48, paddingHorizontal: 12 },
    rowTitle: { color: tokens.fg1, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 16 },
    rowValue: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 }, disabled: { opacity: 0.4 }, pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
    empty: { alignItems: 'center', gap: 16, padding: 32 }, emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' },
    action: { backgroundColor: tokens.bgWell, borderRadius: 999, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }, actionText: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
  })
}
