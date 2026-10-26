import { IconButton } from '@/components/ui/icon-button'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useHabitFormInteraction } from './habit-form-fields/habit-form-interaction'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
} from 'react-native'
import { ChevronUp, ChevronDown, X, Copy, Plus, RotateCcw, Trash2 } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { MAX_CHECKLIST_ITEMS } from '@orbit/shared/validation'
import { useChecklistItemKeys } from '@/hooks/use-checklist-item-keys'
import { createTokensV2, radius } from '@/lib/theme'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useAppTheme } from '@/lib/use-app-theme'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'

interface HabitChecklistProps {
  items: ChecklistItem[]
  /** Interactive mode: user can toggle checkboxes */
  interactive?: boolean
  /** Editable mode: user can add/remove/reorder items */
  editable?: boolean
  proposedItemCount?: number
  onItemsChange?: (items: ChecklistItem[]) => void
  onToggle?: (index: number) => void
  onReset?: () => void
}

type AppTokens = ReturnType<typeof createTokensV2>

interface EditableChecklistItemProps {
  text: string
  index: number
  onUpdateText: (index: number, text: string) => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
  duplicateDisabled: boolean
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
}

function EditableChecklistItem({
  text,
  index,
  onUpdateText,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  duplicateDisabled,
  styles,
  tokens,
}: Readonly<EditableChecklistItemProps>) {
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const { t } = useTranslation()
  const [localText, setLocalText] = useState(text)
  const [focused, setFocused] = useState(false)
  const [previousText, setPreviousText] = useState(text)
  if (text !== previousText) {
    setPreviousText(text)
    if (!focused) setLocalText(text)
  }

  return (
    <View style={styles.editableItem}>
      <View style={styles.moveButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('habits.form.moveChecklistItemUp')}
          style={({ pressed }) => [
            styles.moveButton,
            pressed && !isFirst ? { backgroundColor: tokens.bgHover } : null,
          ]}
          onPress={onMoveUp}
          disabled={disabled || isFirst}
        >
          <ChevronUp size={16} color={tokens.fg3} style={{ opacity: isFirst ? 0.3 : 1 }} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('habits.form.moveChecklistItemDown')}
          style={({ pressed }) => [
            styles.moveButton,
            pressed && !isLast ? { backgroundColor: tokens.bgHover } : null,
          ]}
          onPress={onMoveDown}
          disabled={disabled || isLast}
        >
          <ChevronDown size={16} color={tokens.fg3} style={{ opacity: isLast ? 0.3 : 1 }} />
        </Pressable>
      </View>
      <View style={styles.uncheckedBox} />
      <BottomSheetAppTextInput isChangeDisabled={isDisabled}
        editable={!disabled}
        accessibilityState={{ disabled }}
        value={localText}
        style={styles.itemTextInput}
        placeholderTextColor={tokens.fg3}
        accessibilityLabel={t('habits.form.checklistItemLabel', { n: index + 1 })}
        onFocus={() => setFocused(true)}
        onBlur={guard(() => { setFocused(false); if (localText !== text) onUpdateText(index, localText) })}
        onChangeText={guard((value) => { setLocalText(value); onUpdateText(index, value) })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.duplicateChecklistItem')}
        style={({ pressed }) => [
          styles.itemAction,
          duplicateDisabled ? { opacity: 0.35 } : null,
          pressed ? { backgroundColor: tokens.bgHover } : null,
        ]}
        onPress={() => onDuplicate(index)}
        disabled={disabled || duplicateDisabled}
      >
        <Copy size={16} color={tokens.fg3} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.removeChecklistItem')}
        disabled={disabled}
        style={({ pressed }) => [
          styles.itemAction,
          pressed ? { backgroundColor: tokens.bgHover } : null,
        ]}
        onPress={() => onRemove(index)}
      >
        <X size={16} color={tokens.fg3} strokeWidth={1.8} />
      </Pressable>
    </View>
  )
}

interface InteractiveChecklistItemProps {
  item: ChecklistItem
  index: number
  itemsLength: number
  interactive: boolean
  onToggle: (index: number) => void
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
}

function InteractiveChecklistItem({
  item,
  index,
  itemsLength,
  interactive,
  onToggle,
  styles,
  tokens,
}: Readonly<InteractiveChecklistItemProps>) {
  const [pressed, setPressed] = useState(false)
  const content = <Text style={[styles.itemText, { lineHeight: 22.4 }, item.isChecked && styles.itemTextChecked, pressed && { color: tokens.fg2 }]}>{item.text}</Text>
  return <View style={[index < itemsLength - 1 ? styles.interactiveItemDivider : null, { flexDirection: 'row', minWidth: 0, alignItems: 'flex-start', padding: SPACING.s4 }]}>
    {interactive ? <Pressable onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} accessibilityRole="button" accessibilityLabel={item.text} onPress={() => onToggle(index)} style={({ pressed }) => [styles.interactiveItem, { flex: 1, minWidth: 0, minHeight: TOUCH_TARGET_MIN, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>{content}</Pressable> : <View style={{ flex: 1, minWidth: 0 }}>{content}</View>}
    {interactive ? <Checkbox label={item.text} checked={item.isChecked} onChange={() => onToggle(index)} /> : null}
  </View>
}

interface ChecklistAddRowProps {
  value: string
  onChangeText: (text: string) => void
  onAdd: () => void
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
  disabled: boolean
}

function ChecklistAddRow({
  value,
  onChangeText,
  onAdd,
  styles,
  tokens,
  disabled,
}: Readonly<ChecklistAddRowProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.addItemRow}>
      <View style={styles.addItemField}>
        <Input
          label={t('habits.form.checklistPlaceholder')}
          hideLabel
          name="checklistItem"
          autoComplete="off"
          value={value}
          placeholder={t('habits.form.checklistPlaceholder')}
          disabled={disabled}
          onChange={onChangeText}
          onSubmit={onAdd}
        />
      </View>
      <PillButton
        variant="ghost"
        size="sm"
        iconOnly
        label={t('common.add')}
        disabled={disabled || !value.trim()}
        onClick={onAdd}
      >
        <Plus size={20} color={tokens.fg1} strokeWidth={2} accessible={false} />
      </PillButton>
    </View>
  )
}

export function HabitChecklist({
  items,
  interactive = false,
  editable = false,
  proposedItemCount = 0,
  onItemsChange,
  onToggle,
  onReset,
}: Readonly<HabitChecklistProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [newItemText, setNewItemText] = useState('')
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const editableItemKeys = useChecklistItemKeys(items)

  const checkedCount = items.filter((i) => i.isChecked).length
  const atItemLimit = items.length >= MAX_CHECKLIST_ITEMS

  const addItem = useCallback(() => {
    const text = newItemText.trim()
    if (!text || atItemLimit) return
    const next = [...items, { text, isChecked: false }]
    onItemsChange?.(next)
    setNewItemText('')
  }, [atItemLimit, items, newItemText, onItemsChange])

  const removeItem = useCallback(
    (index: number) => {
      const next = items.filter((_, i) => i !== index)
      onItemsChange?.(next)
    },
    [items, onItemsChange],
  )

  const updateItemText = useCallback(
    (index: number, text: string) => {
      const next = items.map((item, i) => (i === index ? { ...item, text } : item))
      onItemsChange?.(next)
    },
    [items, onItemsChange],
  )

  const duplicateItem = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item || atItemLimit) return
      const clone: ChecklistItem = { text: item.text, isChecked: false }
      const next = [...items]
      next.splice(index + 1, 0, clone)
      onItemsChange?.(next)
    },
    [atItemLimit, items, onItemsChange],
  )

  const moveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= items.length) return
      const next = [...items]
      const spliced = next.splice(fromIndex, 1)
      const moved = spliced[0]
      if (!moved) return
      next.splice(toIndex, 0, moved)
      onItemsChange?.(next)
    },
    [items, onItemsChange],
  )

  const clearAll = useCallback(() => {
    onItemsChange?.([])
  }, [onItemsChange])

  const handleToggle = useCallback(
    (index: number) => {
      onToggle?.(index)
    },
    [onToggle],
  )

  if (!editable && items.length === 0) return null

  return (
    <View style={styles.container}>
      {items.length > 0 && !editable && (
        <View style={styles.progressRow}>
          <ProgressBar
            value={items.length > 0 ? checkedCount / items.length : 0} max={1}
            label={`${checkedCount}/${items.length}`}

          />
          <Text style={styles.progressText}>
            {checkedCount}/{items.length}
          </Text>
          {interactive && checkedCount > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('habits.form.resetChecklist')}
              style={({ pressed }) => [
                styles.actionButton,
                pressed ? { backgroundColor: tokens.bgHover } : null,
              ]}
              onPress={onReset}
            >
              {({ pressed }) => <RotateCcw size={16} color={pressed ? tokens.fg2 : tokens.primary} strokeWidth={1.8} />}
            </Pressable>
          )}

        </View>
      )}

      {editable ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <Proposed
              key={editableItemKeys[index]}
              proposed={index >= items.length - proposedItemCount}
              scope="row"
              label={t('habits.detail.proposed')}
            >
              <EditableChecklistItem
                text={item.text}
                index={index}
                onUpdateText={guard(updateItemText)}
                onDuplicate={guard(duplicateItem)}
                onRemove={guard(removeItem)}
                onMoveUp={guard(() => moveItem(index, index - 1))}
                onMoveDown={guard(() => moveItem(index, index + 1))}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                duplicateDisabled={atItemLimit}
                styles={styles}
                tokens={tokens}
              />
            </Proposed>
          ))}
        </View>
      ) : (
        items.length > 0 && (
          <View style={styles.itemsCard}>
            {items.map((item, index) => (
              // react-doctor-disable-next-line no-array-index-as-key -- ChecklistItem is a value object with no stable id; the interactive list is toggle-only and never reorders, so the positional key is stable https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              <InteractiveChecklistItem
                key={`${item.text}-${index}`}
                item={item}
                index={index}
                itemsLength={items.length}
                interactive={interactive}
                tokens={tokens}
                onToggle={handleToggle}
                styles={styles}
              />
            ))}
          </View>
        )
      )}

      {editable && items.length > 0 && (
        <View style={styles.clearRow}>
          <IconButton label={t('habits.form.clearChecklist')} disabled={disabled} onPress={guard(clearAll)}><Trash2 size={20} strokeWidth={1.5} accessible={false} /></IconButton>
        </View>
      )}

      {editable && (
        <ChecklistAddRow
          value={newItemText}
          onChangeText={guard(setNewItemText)}
          onAdd={guard(addItem)}
          styles={styles}
          tokens={tokens}
          disabled={disabled || atItemLimit}
        />
      )}
      {editable && atItemLimit ? (
        <Text accessibilityRole="text" style={styles.limitText}>
          {t('habits.form.checklistItemLimit')}
        </Text>
      ) : null}
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
  container: {
    gap: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
  },
  progressText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: tokens.fg3,
    fontVariant: ['tabular-nums'],
  },
  actionButton: {
    overflow: 'hidden',
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAction: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    borderRadius: radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.s8,
  },
  clearText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
    color: tokens.statusBadText,
  },
  limitText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12,
    color: tokens.fg3,
  },
  clearRow: {
    alignItems: 'flex-end',
  },
  itemsList: {
    gap: 4,
  },
  itemsCard: {
    borderRadius: 18,
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.hairline,
    overflow: 'hidden',
  },
  editableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.s4,
  },
  moveButtons: {
    width: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moveButton: {
    overflow: 'hidden',
    borderRadius: 999,
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckedBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.fg3,
  },
  itemTextInput: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    color: tokens.fg1,
    paddingVertical: SPACING.s4,
    paddingHorizontal: SPACING.s8,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  itemAction: {
    overflow: 'hidden',
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interactiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACING.s16,
    paddingHorizontal: SPACING.s16,
  },
  interactiveItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.hairline,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: tokens.primary,
  },
  checkboxUnchecked: {
    borderWidth: 2,
    borderColor: tokens.fg3,
  },
  itemText: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    color: tokens.fg1,
  },
  itemTextChecked: {
    color: tokens.fg3,
  },
  addItemRow: {
    flexDirection: 'row',
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    gap: 8,
  },
  addItemField: {
    flex: 1,
    minWidth: 0,
  },
  })
}
