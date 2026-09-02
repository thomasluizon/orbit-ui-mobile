import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import type { BreakdownEditableHabit } from '@orbit/shared/utils'
import { buildBreakdownCreateRequest, filterValidBreakdownHabits, getBreakdownCadenceKey, nextBreakdownCadence } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { AlertTriangle } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type DraftHabit = BreakdownEditableHabit & { id: string }
type ItemResult = 'done' | 'failed' | undefined

function toDraftHabit(habit: SuggestedSubHabit, index: number): DraftHabit {
  return {
    id: `proposal-${index}`,
    title: habit.title,
    description: habit.description ?? '',
    frequencyUnit: habit.frequencyUnit ?? null,
    frequencyQuantity: habit.frequencyQuantity ?? null,
    days: habit.days ?? null,
    isBadHabit: habit.isBadHabit ?? false,
    dueDate: habit.dueDate ?? null,
    checklistItems: habit.checklistItems ?? null,
  }
}

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const { t } = useTranslation()
  const bulkCreate = useBulkCreateHabits()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [habits, setHabits] = useState<DraftHabit[]>(() =>
    subHabits.map((habit, index) => toDraftHabit(habit, index)),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const failedIds = habits.filter((habit) => results[habit.id] === 'failed').map((habit) => habit.id)
  const submit = async (onlyIds?: readonly string[]) => {
    const selected = onlyIds ? habits.filter((habit) => onlyIds.includes(habit.id)) : habits
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0) return
    try {
      const response = await bulkCreate.mutateAsync(buildBreakdownCreateRequest(valid, parentName, false))
      const next = { ...results }
      response.results.forEach((result) => {
        const habit = selected[result.index]
        if (habit) next[habit.id] = result.status === 'Success' ? 'done' : 'failed'
      })
      setResults(next)
      if (response.results.every((result) => result.status === 'Success')) onConfirmed()
    } catch {
      setResults((current) => ({ ...current, ...Object.fromEntries(selected.map((habit) => [habit.id, 'failed'])) }))
    }
  }
  if (rejected) return <Text accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, color: tokens.fg2, backgroundColor: tokens.bgWell }}>{t('chat.preview.rejected', { name: parentName })}</Text>
  const partiallyFailed = failedIds.length > 0
  const rows = habits.map((habit) => ({
    id: habit.id,
    label: editingId === habit.id ? <TextInput autoFocus accessibilityLabel={t('chat.preview.editName', { name: habit.title })} value={habit.title} onBlur={() => setEditingId(null)} onChangeText={(title) => setHabits((current) => current.map((item) => item.id === habit.id ? { ...item, title } : item))} style={{ minHeight: 44, color: tokens.fg1, backgroundColor: tokens.bgField }} /> : habit.title,
    meta: results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: results[habit.id],
    proposed: results[habit.id] == null,
    irreversible: results[habit.id] == null,
    control: results[habit.id] == null ? <Pressable accessibilityRole="button" accessibilityLabel={t('chat.breakdown.frequency', { name: habit.title })} onPress={() => setHabits((current) => current.map((item) => item.id === habit.id ? { ...item, frequencyUnit: nextBreakdownCadence(item.frequencyUnit) } : item))} style={{ minHeight: 40, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, backgroundColor: tokens.bgWell }}><Text style={{ color: tokens.fg2 }}>{t(getBreakdownCadenceKey(habit.frequencyUnit))}</Text></Pressable> : undefined,
  }))
  return <><BlockFrame state={bulkCreate.isPending ? 'acting' : partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} items={rows} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    {warning?.hasConflict ? <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} color={tokens.statusOverdue} /><Text style={{ color: tokens.fg2 }}>{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</Text></View> : null}
    {partiallyFailed ? <Button size="sm" onClick={() => void submit(failedIds)}>{t('chat.batch.retry', { count: failedIds.length })}</Button> : <><Button size="sm" disabled={bulkCreate.isPending} onClick={() => setConfirmOpen(true)}>{t('chat.preview.approve')}</Button><Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => setEditingId(habits[0]?.id ?? null)}>{t('chat.preview.edit')}</Button><Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => setRejected(true)}>{t('chat.preview.reject')}</Button></>}
  </View>} /><ConfirmSheet open={confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void submit() }} /></>
}
