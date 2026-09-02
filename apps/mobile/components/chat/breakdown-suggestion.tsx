import { Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useBreakdownSuggestionState } from '@orbit/shared/hooks'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { getBreakdownCadenceKey } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { AlertTriangle } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const { t } = useTranslation()
  const bulkCreate = useBulkCreateHabits()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const card = useBreakdownSuggestionState({ subHabits, parentName, onBulkCreate: bulkCreate.mutateAsync, onConfirmed })
  if (card.rejected) return <Text accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, color: tokens.fg2, backgroundColor: tokens.bgWell }}>{t('chat.preview.rejected', { name: parentName })}</Text>
  const rows = card.habits.map((habit) => ({
    id: habit.id,
    label: card.editingId === habit.id ? <TextInput autoFocus accessibilityLabel={t('chat.preview.editName', { name: habit.title })} value={habit.title} onBlur={() => card.setEditingId(null)} onChangeText={(title) => card.editTitle(habit.id, title)} style={{ minHeight: 44, color: tokens.fg1, backgroundColor: tokens.bgField }} /> : habit.title,
    meta: card.results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: card.results[habit.id],
    proposed: card.results[habit.id] == null,
    irreversible: card.results[habit.id] == null,
    control: card.results[habit.id] == null ? <Pressable accessibilityRole="button" accessibilityLabel={t('chat.breakdown.frequency', { name: habit.title })} onPress={() => card.cycleCadence(habit.id)} style={{ minHeight: 40, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, backgroundColor: tokens.bgWell }}><Text style={{ color: tokens.fg2 }}>{t(getBreakdownCadenceKey(habit.frequencyUnit))}</Text></Pressable> : undefined,
  }))
  return <><BlockFrame state={bulkCreate.isPending ? 'acting' : card.partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} items={rows} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={card.setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    {warning?.hasConflict ? <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} color={tokens.statusOverdue} /><Text style={{ color: tokens.fg2 }}>{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</Text></View> : null}
    {card.partiallyFailed ? <Button size="sm" onClick={() => void card.submit(card.failedIds)}>{t('chat.batch.retry', { count: card.failedIds.length })}</Button> : <><Button size="sm" disabled={bulkCreate.isPending} onClick={() => card.setConfirmOpen(true)}>{t('chat.preview.approve')}</Button><Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => card.setEditingId(card.habits[0]?.id ?? null)}>{t('chat.preview.edit')}</Button><Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={card.reject}>{t('chat.preview.reject')}</Button></>}
  </View>} /><ConfirmSheet open={card.confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.submit() }} /></>
}
