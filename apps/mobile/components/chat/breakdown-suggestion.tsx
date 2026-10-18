import { AstraGlyph } from '@/components/ui/astra-glyph'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useCallback, useState } from 'react'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import type { BulkCreateRequest } from '@orbit/shared/types/habit'
import { useBreakdownSuggestionState } from '@/hooks/use-breakdown-suggestion-state'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import { getBreakdownCadenceKey } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { Checkbox } from '@/components/ui/checkbox'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
import { AlertTriangle, MoreVertical, Plus, Trash2 } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function buildBreakdownRows({ card, t, editingDisabled, tokens }: Readonly<{ card: ReturnType<typeof useBreakdownSuggestionState>; t: ReturnType<typeof useTranslation>['t']; editingDisabled: boolean; tokens: ReturnType<typeof createTokensV2> }>) {
  const visibleHabits = card.completed ? card.habits.filter((habit) => card.results[habit.id] === 'done') : card.habits
  return visibleHabits.map((habit) => ({
    id: habit.id,
    wrapLabel: true,
    editable: !editingDisabled,
    label: card.editingId === habit.id || habit.title.trim() === '' ? <TypedTextInput editable={!editingDisabled} autoFocus={card.editingId === habit.id} placeholder={t('habits.form.newHabit')} onFocus={() => card.setEditingId(habit.id)} accessibilityLabel={t('chat.preview.editName', { name: habit.title.trim() || t('habits.form.newHabit') })} value={habit.title} onBlur={() => card.setEditingId(null)} onChangeText={(title) => card.editTitle(habit.id, title)} style={{ minHeight: TOUCH_TARGET_MIN, borderRadius: 8, borderWidth: 2, borderColor: card.editingId === habit.id ? tokens.primary : tokens.borderControl, color: tokens.fg1, backgroundColor: tokens.bgField, paddingHorizontal: 12 }} /> : <PersonalTextDetails outset proposed={habit.proposed && card.results[habit.id] == null}>{habit.title}</PersonalTextDetails>,
    meta: card.results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: card.results[habit.id],
    proposed: habit.proposed && card.results[habit.id] == null,
    irreversible: card.results[habit.id] == null,
    control: card.results[habit.id] == null ? (
      <><Pressable disabled={editingDisabled} accessibilityState={{ disabled: editingDisabled }} accessibilityRole="button" accessibilityLabel={t('chat.breakdown.frequency', { name: habit.title.trim() || t('habits.form.newHabit') })} onPress={() => card.cycleCadence(habit.id)} style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, backgroundColor: tokens.bgWell }}><Text style={{ color: tokens.fg2 }}>{t(getBreakdownCadenceKey(habit.frequencyUnit))}</Text></Pressable>
       {!card.hasSubmitted ? <Button variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN} disabled={editingDisabled} label={t('habits.breakdown.removeHabit', { name: habit.title.trim() || t('chat.breakdown.unnamedHabit') })} onClick={() => card.setRemovalId(habit.id)}>
         <Trash2 accessible={false} color={tokens.fg2} size={20} strokeWidth={1.5} />
       </Button> : null}</>
    ) : undefined,
  }))
}

function BreakdownActions({ card, isPending, editingDisabled, warning, parentName, tokens }: Readonly<{ card: ReturnType<typeof useBreakdownSuggestionState>; isPending: boolean; editingDisabled: boolean; warning?: ConflictWarning | null; parentName: string; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const menu = useAnchoredMenu()
  const createErrorKey = card.hasSubmitted ? 'habits.breakdown.retryError' : 'habits.breakdown.createError'
  const isEmpty = card.habits.length === 0
  const addVariant = isEmpty ? 'primary' : 'ghost'
  const approveVariant = isEmpty ? 'secondary' : 'primary'
  const addIconColor = isEmpty ? tokens.fgOnPrimary : tokens.fg1
  return (
<>
    <Text accessibilityLiveRegion="polite" style={{ flexBasis: '100%', color: tokens.fg2, ...(card.capacityDenied ? {} : { position: 'absolute', height: 0 }) }}>{card.capacityDenied ? t('habits.breakdown.capacityDenied') : ''}</Text>
    <Text accessibilityLiveRegion="polite" style={{ flexBasis: '100%', color: tokens.fg2, ...(card.atCapacity && !card.hasSubmitted ? {} : { position: 'absolute', height: 0 }) }}>{card.atCapacity && !card.hasSubmitted ? t('habits.breakdown.limit', { limit: MAX_BULK_OPERATION_SIZE }) : ''}</Text>
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ flexBasis: '100%', color: tokens.statusBadText, ...(card.createError ? {} : { position: 'absolute', height: 0 }) }}>{card.createError ? t(createErrorKey) : ''}</Text>
    {warning?.hasConflict ? <View style={{ flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 }}><AlertTriangle accessible={false} size={16} color={tokens.statusOverdue} /><Text style={{ flex: 1, color: tokens.fg2 }}>{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</Text></View> : null}
    {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
    {card.partiallyFailed ? <Button size="sm" disabled={isPending} loading={isPending} onClick={() => void card.submit(card.failedIds)}>{t('chat.batch.retry', { count: card.failedIds.length })}</Button> : <><Button size="sm" variant={addVariant} leadingIcon={<Plus accessible={false} size={16} color={addIconColor} />} disabled={editingDisabled || card.confirmOpen || card.atCapacity} onClick={card.addHabit}>{t('habits.breakdown.addHabit')}</Button><MenuAnchorHost anchorRef={menu.anchorRef}>
      <Button size="sm" variant="ghost" iconOnly minimumHeight={TOUCH_TARGET_MIN} label={t('habits.actions.more')} expanded={menu.visible && !editingDisabled} disabled={editingDisabled} onClick={menu.toggle}>
        <MoreVertical accessible={false} size={20} color={tokens.fg1} />
      </Button>
    </MenuAnchorHost>
    <Menu open={menu.visible && !editingDisabled} anchorRef={menu.anchorRef} title={t('habits.actions.more')}
      items={[
        { id: 'edit', label: t('chat.preview.edit'), icon: 'pencil', disabled: editingDisabled || isEmpty },
        { id: 'reject', label: t('chat.preview.reject'), disabled: editingDisabled },
      ]}
      onClose={menu.close}
      onSelect={(id) => { if (id === 'edit') card.setEditingId(card.habits[0]?.id ?? null); else if (id === 'reject') card.reject() }} /><Button size="sm" variant={approveVariant} disabled={editingDisabled || card.habits.length === 0} loading={isPending} onClick={() => card.setConfirmOpen(true)}>{t('chat.preview.approve')}</Button></>}
  </>
  )
}

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const { t } = useTranslation()
  const [groupingHovered, setGroupingHovered] = useState(false)
  const bulkCreate = useBulkCreateHabits()
  const trackCardOperation = useChatCardOperation()
  const { mutateAsync } = bulkCreate
  const createHabits = useCallback((request: BulkCreateRequest) =>
    trackCardOperation(() => mutateAsync(request)), [mutateAsync, trackCardOperation])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const card = useBreakdownSuggestionState({ subHabits, parentName, onBulkCreate: createHabits, onConfirmed })
  const removalHabit = card.habits.find((habit) => habit.id === card.removalId)
  const isPending = bulkCreate.isPending || card.isSubmitting
  const editingDisabled = isPending || card.groupingLocked

  if (card.rejected) return <Text accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, color: tokens.fg2, backgroundColor: tokens.bgWell }}>{t('chat.preview.rejected', { name: parentName })}</Text>
  const rows = buildBreakdownRows({ card, t, editingDisabled, tokens })

  return <><BlockFrame state={isPending ? 'acting' : card.partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} titleMode="typed" items={rows} body={card.completed ? null : <View style={{ minWidth: 0, flexShrink: 0 }}>{card.habits.length === 0 ? <View style={{ alignItems: 'center', gap: 24 }}><AstraGlyph size={96} color={tokens.fg1} /><Text style={{ color: tokens.fg2, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' }}>{t('chat.breakdown.empty')}</Text></View> : null}<InsetFocusPressable accessibilityRole="checkbox" accessibilityLabel={t('habits.breakdown.createAsParent')} accessibilityState={{ checked: card.createAsParent, disabled: isPending || card.groupingLocked }} disabled={isPending || card.groupingLocked} onHoverIn={() => setGroupingHovered(true)} onHoverOut={() => setGroupingHovered(false)} onPress={() => card.setCreateAsParent(!card.createAsParent)} style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 4, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 12, backgroundColor: (pressed || groupingHovered) && !isPending && !card.groupingLocked ? tokens.bgHover : 'transparent', opacity: isPending || card.groupingLocked ? 0.6 : 1 })}>
    <Checkbox as="span" checked={card.createAsParent} onChange={card.setCreateAsParent} />
    <Text style={{ flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.4, color: tokens.fg2 }}>{t('habits.breakdown.createAsParent')}</Text>
  </InsetFocusPressable>
  <View accessibilityLiveRegion="polite">{card.groupingDenied ? <Text style={{ fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.4, color: tokens.fg2 }}>{t('habits.breakdown.groupingDenied')}</Text> : null}</View>
  </View>} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={card.setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={card.completed ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.4, color: tokens.fg2 }}>{t('chat.action.completed')}</Text> : <BreakdownActions card={card} isPending={isPending} editingDisabled={editingDisabled} warning={warning} parentName={parentName} tokens={tokens} />} /><ConfirmSheet open={card.confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.submit() }} /><ConfirmSheet open={removalHabit != null} title={t('chat.breakdown.removeTitle')} message={t('chat.breakdown.removeBody', { name: removalHabit?.title.trim() || t('chat.breakdown.unnamedHabit') })} confirmLabel={t('chat.operation.remove')} destructive loading={isPending} onCancel={() => card.setRemovalId(null)} onConfirm={card.removeHabit} /></>
}
