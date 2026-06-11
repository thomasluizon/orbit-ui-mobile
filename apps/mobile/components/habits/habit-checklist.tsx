import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { ChevronUp, ChevronDown, X, Copy, Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ChecklistItem } from '@orbit/shared/types/habit'
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
}: EditableChecklistItemProps) {
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
        <TouchableOpacity
          style={styles.moveButton}
          onPress={onMoveUp}
          disabled={isFirst}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <ChevronUp size={14} color={tokens.fg3} style={{ opacity: isFirst ? 0.3 : 1 }} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moveButton}
          onPress={onMoveDown}
          disabled={isLast}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <ChevronDown size={14} color={tokens.fg3} style={{ opacity: isLast ? 0.3 : 1 }} />
        </TouchableOpacity>
      </View>
      <View style={styles.uncheckedBox} />
      <BottomSheetAppTextInput
        value={localText}
        style={styles.itemTextInput}
        placeholderTextColor={tokens.fg3}
        onChangeText={setLocalText}
        onBlur={flushLocalText}
      />
      <TouchableOpacity
        style={styles.itemAction}
        onPress={handleDuplicate}
        activeOpacity={0.7}
      >
        <Copy size={14} color={tokens.fg3} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.itemAction}
        onPress={handleRemove}
        activeOpacity={0.7}
      >
        <X size={14} color={tokens.fg3} />
      </TouchableOpacity>
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
  const [, setJustCheckedIndex] = useState(-1)
  const checkPopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const checkedCount = items.filter((i) => i.isChecked).length

  useEffect(() => {
    return () => {
      if (checkPopTimer.current) clearTimeout(checkPopTimer.current)
    }
  }, [])

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
      if (!items[index]?.isChecked) {
        if (checkPopTimer.current) clearTimeout(checkPopTimer.current)
        setJustCheckedIndex(index)
        checkPopTimer.current = setTimeout(() => setJustCheckedIndex(-1), 250)
      }
      onToggle?.(index)
    },
    [items, onToggle],
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
            <TouchableOpacity onPress={onReset} activeOpacity={0.7}>
              <Text style={styles.resetText}>{t('habits.form.resetChecklist')}</Text>
            </TouchableOpacity>
          )}
          {interactive && (
            <TouchableOpacity onPress={onClear} activeOpacity={0.7}>
              <Text style={styles.clearText}>{t('habits.form.clearChecklist')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {editable ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <EditableChecklistItem
              key={`edit-${index}`}
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
              <View
                key={`${item.text}-${index}`}
                style={[
                  styles.interactiveItem,
                  index < items.length - 1 ? styles.interactiveItemDivider : null,
                ]}
              >
                {interactive && (
                  <TouchableOpacity
                    onPress={() => handleToggle(index)}
                    activeOpacity={0.7}
                    hitSlop={9}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        item.isChecked
                          ? styles.checkboxChecked
                          : styles.checkboxUnchecked,
                      ]}
                    >
                      {item.isChecked && (
                        <Check size={15} color={tokens.fgOnPrimary} strokeWidth={3} />
                      )}
                    </View>
                  </TouchableOpacity>
                )}
                <Text
                  style={[
                    styles.itemText,
                    item.isChecked && styles.itemTextChecked,
                  ]}
                  numberOfLines={2}
                >
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        )
      )}

      {editable && items.length > 0 && (
        <View style={styles.clearRow}>
          <TouchableOpacity onPress={clearAll} activeOpacity={0.7}>
            <Text style={styles.clearText}>{t('habits.form.clearChecklist')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {editable && (
        <View style={styles.addItemRow}>
          <BottomSheetAppTextInput
            value={newItemText}
            placeholder={t('habits.form.checklistPlaceholder')}
            placeholderTextColor={tokens.fg4}
            style={styles.addItemInput}
            onChangeText={setNewItemText}
            onSubmitEditing={addItem}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[
              styles.addItemButton,
              !newItemText.trim() && styles.addItemButtonDisabled,
            ]}
            disabled={!newItemText.trim()}
            onPress={addItem}
            activeOpacity={0.7}
          >
            <Text style={styles.addItemButtonText}>{t('common.add')}</Text>
          </TouchableOpacity>
        </View>
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
  resetText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    color: tokens.primary,
  },
  clearText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    color: tokens.statusBad,
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
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  moveButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckedBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.fg4,
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
    padding: 4,
  },
  interactiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
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
    borderColor: tokens.fg4,
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
    justifyContent: 'center',
  },
  addItemButtonDisabled: {
    opacity: 0.4,
  },
  addItemButtonText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    color: tokens.fgOnPrimary,
  },
  })
}
