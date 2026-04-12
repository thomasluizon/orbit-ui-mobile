import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native'
import { GripHorizontal, X, Copy, Check, Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { createColors, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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

type AppColors = ReturnType<typeof createColors>

// ---------------------------------------------------------------------------
// EditableChecklistItem -- local state avoids parent re-render per keystroke
// ---------------------------------------------------------------------------

interface EditableChecklistItemProps {
  text: string
  index: number
  onUpdateText: (index: number, text: string) => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
  styles: ReturnType<typeof createStyles>
  colors: AppColors
}

function EditableChecklistItem({
  text,
  index,
  onUpdateText,
  onDuplicate,
  onRemove,
  styles,
  colors,
}: EditableChecklistItemProps) {
  const [localText, setLocalText] = useState(text)

  // Sync from parent when items array changes externally (e.g. template load)
  useEffect(() => {
    setLocalText(text)
  }, [text])

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
      <View style={styles.dragHandle}>
        <GripHorizontal size={14} color={colors.textMuted} />
      </View>
      <View style={styles.uncheckedBox} />
      <TextInput
        value={localText}
        style={styles.itemTextInput}
        placeholderTextColor={colors.textMuted}
        onChangeText={setLocalText}
        onBlur={flushLocalText}
      />
      <TouchableOpacity
        style={styles.itemAction}
        onPress={handleDuplicate}
        activeOpacity={0.7}
      >
        <Copy size={14} color={colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.itemAction}
        onPress={handleRemove}
        activeOpacity={0.7}
      >
        <X size={14} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const { colors } = useAppTheme()
  const [newItemText, setNewItemText] = useState('')
  const [justCheckedIndex, setJustCheckedIndex] = useState(-1)
  const checkPopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const styles = useMemo(() => createStyles(colors), [colors])

  const checkedCount = items.filter((i) => i.isChecked).length
  const progressPercent = items.length > 0 ? (checkedCount / items.length) * 100 : 0

  // -- Editable actions --

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

  const clearAll = useCallback(() => {
    onItemsChange?.([])
  }, [onItemsChange])

  // -- Interactive actions --

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
      {/* Progress + actions */}
      {items.length > 0 && !editable && (
        <View style={styles.progressRow}>
          <View style={styles.progressBarOuter}>
            <View
              style={[styles.progressBarInner, { width: `${progressPercent}%` }]}
            />
          </View>
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

      {/* Items list (editable) */}
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
              styles={styles}
              colors={colors}
            />
          ))}
        </View>
      ) : (
        /* Items list (interactive / read-only) */
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <View key={`${item.text}-${index}`} style={styles.interactiveItem}>
              {interactive && (
                <TouchableOpacity
                  onPress={() => handleToggle(index)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      item.isChecked
                        ? styles.checkboxChecked
                        : styles.checkboxUnchecked,
                    ]}
                  >
                    {item.isChecked && <Check size={12} color={colors.white} />}
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
      )}

      {/* Clear all (editable mode only) */}
      {editable && items.length > 0 && (
        <View style={styles.clearRow}>
          <TouchableOpacity onPress={clearAll} activeOpacity={0.7}>
            <Text style={styles.clearText}>{t('habits.form.clearChecklist')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add item (editable mode only) */}
      {editable && (
        <View style={styles.addItemRow}>
          <TextInput
            value={newItemText}
            placeholder={t('habits.form.checklistPlaceholder')}
            placeholderTextColor={colors.textMuted}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  resetText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  clearText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.red400,
  },
  clearRow: {
    alignItems: 'flex-end',
  },
  itemsList: {
    gap: 4,
  },
  editableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  dragHandle: {
    width: 14,
    alignItems: 'center',
  },
  uncheckedBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
  },
  itemTextInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
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
    gap: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxUnchecked: {
    borderColor: colors.border,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  itemTextChecked: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  addItemRow: {
    flexDirection: 'row',
  },
  addItemInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
    borderRightWidth: 0,
  },
  addItemButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  addItemButtonDisabled: {
    opacity: 0.4,
  },
  addItemButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  })
}
