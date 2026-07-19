import { useState, useCallback, useMemo } from 'react'
import {
  Pressable,
  View,
  Text,
  StyleSheet,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated'
import { ChevronUp, ChevronDown, X, Copy, Check, Plus, RotateCcw } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitChecklistProps {
  items: ChecklistItem[]
  /** Interactive mode: user can toggle checkboxes */
  interactive?: boolean
  /** Editable mode: user can add/remove/reorder items */
  editable?: boolean
  onItemsChange?: (items: ChecklistItem[]) => void
  onToggle?: (index: number) => void
  onReset?: () => void
  onClear?: () => void
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
  styles,
  tokens,
}: Readonly<EditableChecklistItemProps>) {
  const { t } = useTranslation()
  const [localText, setLocalText] = useState(text)

  const [previousText, setPreviousText] = useState(text)
  if (text !== previousText) {
    setPreviousText(text)
    setLocalText(text)
  }

  const flushLocalText = useCallback(() => {
    if (localText !== text) {
      onUpdateText(index, localText)
    }
  }, [localText, text, index, onUpdateText])

  const handleDuplicate = useCallback(() => {
    flushLocalText()
    onDuplicate(index)
  }, [flushLocalText, onDuplicate, index])

  const handleRemove = useCallback(() => {
    flushLocalText()
    onRemove(index)
  }, [flushLocalText, onRemove, index])

  return (
    <View style={styles.editableItem}>
      <View style={styles.moveButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('habits.form.moveChecklistItemUp')}
          style={({ pressed }) => [
            styles.moveButton,
            pressed && !isFirst ? { opacity: 0.7 } : null,
          ]}
          onPress={onMoveUp}
          disabled={isFirst}
          hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
        >
          <ChevronUp size={14} color={tokens.fg3} style={{ opacity: isFirst ? 0.3 : 1 }} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('habits.form.moveChecklistItemDown')}
          style={({ pressed }) => [
            styles.moveButton,
            pressed && !isLast ? { opacity: 0.7 } : null,
          ]}
          onPress={onMoveDown}
          disabled={isLast}
          hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
        >
          <ChevronDown size={14} color={tokens.fg3} style={{ opacity: isLast ? 0.3 : 1 }} />
        </Pressable>
      </View>
      <View style={styles.uncheckedBox} />
      <BottomSheetAppTextInput
        value={localText}
        style={styles.itemTextInput}
        placeholderTextColor={tokens.fg3}
        onChangeText={setLocalText}
        onBlur={flushLocalText}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.duplicateChecklistItem')}
        style={({ pressed }) => [
          styles.itemAction,
          pressed ? { opacity: 0.7 } : null,
        ]}
        onPress={handleDuplicate}
      >
        <Copy size={16} color={tokens.fg3} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.removeChecklistItem')}
        style={({ pressed }) => [
          styles.itemAction,
          pressed ? { opacity: 0.7 } : null,
        ]}
        onPress={handleRemove}
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
  const prefersReducedMotion = usePrefersReducedMotion()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  function handlePress() {
    if (!item.isChecked && !prefersReducedMotion) {
      scale.value = withSequence(
        withSpring(1.18, { damping: 14 }),
        withSpring(1),
      )
    }
    onToggle(index)
  }

  const dividerStyle =
    index < itemsLength - 1 ? styles.interactiveItemDivider : null

  const itemLabel = (
    <Text
      style={[
        styles.itemText,
        item.isChecked && styles.itemTextChecked,
      ]}
      numberOfLines={2}
    >
      {item.text}
    </Text>
  )

  if (!interactive) {
    return <View style={[styles.interactiveItem, dividerStyle]}>{itemLabel}</View>
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.isChecked }}
      accessibilityLabel={item.text}
      style={({ pressed }) => [
        styles.interactiveItem,
        dividerStyle,
        pressed ? styles.interactiveItemPressed : null,
      ]}
    >
      <Animated.View
        style={[
          styles.checkbox,
          item.isChecked ? styles.checkboxChecked : styles.checkboxUnchecked,
          animatedStyle,
        ]}
      >
        {item.isChecked && (
          <Check size={15} color={tokens.fgOnPrimary} strokeWidth={3} />
        )}
      </Animated.View>
      {itemLabel}
    </Pressable>
  )
}

interface ChecklistAddRowProps {
  value: string
  onChangeText: (text: string) => void
  onAdd: () => void
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
}

function ChecklistAddRow({
  value,
  onChangeText,
  onAdd,
  styles,
  tokens,
}: Readonly<ChecklistAddRowProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.addItemRow}>
      <BottomSheetAppTextInput
        value={value}
        placeholder={t('habits.form.checklistPlaceholder')}
        placeholderTextColor={tokens.fg3}
        style={styles.addItemInput}
        onChangeText={onChangeText}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.add')}
        style={({ pressed }) => [
          styles.addItemButton,
          !value.trim() && styles.addItemButtonDisabled,
          pressed && !!value.trim() ? { opacity: 0.7 } : null,
        ]}
        disabled={!value.trim()}
        onPress={onAdd}
      >
        <Plus size={18} color={tokens.fgOnPrimary} strokeWidth={1.8} />
      </Pressable>
    </View>
  )
}

export function HabitChecklist({
  items,
  interactive = false,
  editable = false,
  onItemsChange,
  onToggle,
  onReset,
  onClear,
}: Readonly<HabitChecklistProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [newItemText, setNewItemText] = useState('')
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const checkedCount = items.filter((i) => i.isChecked).length
  const editableItemKeys = items.map((_, index) => `checklist-${index}`)

  const addItem = useCallback(() => {
    const text = newItemText.trim()
    if (!text) return
    const next = [...items, { text, isChecked: false }]
    onItemsChange?.(next)
    setNewItemText('')
  }, [items, newItemText, onItemsChange])

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
      if (!item) return
      const clone: ChecklistItem = { text: item.text, isChecked: false }
      const next = [...items]
      next.splice(index + 1, 0, clone)
      onItemsChange?.(next)
    },
    [items, onItemsChange],
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

  return (
    <View style={styles.container}>
      {items.length > 0 && !editable && (
        <View style={styles.progressRow}>
          <ProgressBar
            progress={items.length > 0 ? checkedCount / items.length : 0}
            label={`${checkedCount}/${items.length}`}
            style={styles.progressBar}
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
                pressed ? { opacity: 0.7 } : null,
              ]}
              onPress={onReset}
              hitSlop={9}
            >
              <RotateCcw size={16} color={tokens.primary} strokeWidth={1.8} />
            </Pressable>
          )}
          {interactive && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('habits.form.clearChecklist')}
              style={({ pressed }) => [
                styles.actionButton,
                pressed ? { opacity: 0.7 } : null,
              ]}
              onPress={onClear}
              hitSlop={9}
            >
              <X size={16} color={tokens.statusBad} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      )}

      {editable ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <EditableChecklistItem
              key={editableItemKeys[index]}
              text={item.text}
              index={index}
              onUpdateText={updateItemText}
              onDuplicate={duplicateItem}
              onRemove={removeItem}
              onMoveUp={() => moveItem(index, index - 1)}
              onMoveDown={() => moveItem(index, index + 1)}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              styles={styles}
              tokens={tokens}
            />
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
                onToggle={handleToggle}
                styles={styles}
                tokens={tokens}
              />
            ))}
          </View>
        )
      )}

      {editable && items.length > 0 && (
        <View style={styles.clearRow}>
          <Pressable
            accessibilityRole="button"
            onPress={clearAll}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            hitSlop={14}
          >
            <Text style={styles.clearText}>{t('habits.form.clearChecklist')}</Text>
          </Pressable>
        </View>
      )}

      {editable && (
        <ChecklistAddRow
          value={newItemText}
          onChangeText={setNewItemText}
          onAdd={addItem}
          styles={styles}
          tokens={tokens}
        />
      )}
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
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    color: tokens.fg3,
    fontVariant: ['tabular-nums'],
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    color: tokens.statusBadText,
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
    paddingVertical: 2,
  },
  moveButtons: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moveButton: {
    width: 24,
    height: 26,
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: tokens.fg1,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  itemAction: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interactiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  interactiveItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.hairline,
  },
  interactiveItemPressed: {
    backgroundColor: tokens.bgElevPressed,
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: tokens.fg1,
  },
  itemTextChecked: {
    color: tokens.fg3,
    textDecorationLine: 'line-through',
  },
  addItemRow: {
    flexDirection: 'row',
    minHeight: 44,
  },
  addItemInput: {
    flex: 1,
    backgroundColor: tokens.bgField,
    color: tokens.fg1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    borderWidth: 1,
    borderColor: tokens.hairline,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderRightWidth: 0,
  },
  addItemButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: tokens.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addItemButtonDisabled: {
    opacity: 0.4,
  },
  })
}
