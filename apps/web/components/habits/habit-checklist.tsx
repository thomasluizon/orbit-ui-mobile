'use client'

import { useState, useRef, useCallback } from 'react'
import { GripHorizontal, X, Copy, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChecklistItem } from '@orbit/shared/types/habit'

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
}: HabitChecklistProps) {
  const t = useTranslations()
  const [newItemText, setNewItemText] = useState('')
  const [justCheckedIndex, setJustCheckedIndex] = useState(-1)
  const checkPopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const checkedCount = items.filter((i) => i.isChecked).length

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
      // Trigger pop animation when checking (not unchecking)
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
    <div className="space-y-2">
      {/* Progress + actions */}
      {items.length > 0 && !editable && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{
                width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-[10px] font-bold text-text-muted tabular-nums">
            {checkedCount}/{items.length}
          </span>
          {interactive && checkedCount > 0 && (
            <button
              type="button"
              className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
              onClick={onReset}
            >
              {t('habits.form.resetChecklist')}
            </button>
          )}
          {interactive && (
            <button
              type="button"
              className="text-[10px] font-semibold text-red-400 hover:text-red-500 transition-colors"
              onClick={onClear}
            >
              {t('habits.form.clearChecklist')}
            </button>
          )}
        </div>
      )}

      {/* Items list (editable) */}
      {editable ? (
        <div className="space-y-1">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 group py-0.5">
              {/* Drag handle */}
              <div className="checklist-drag-handle shrink-0 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary transition-colors">
                <GripHorizontal className="size-3.5" />
              </div>

              {/* Static checkbox indicator */}
              <div className="shrink-0 size-4 rounded border-2 border-border" />

              {/* Text input */}
              <input
                value={item.text}
                type="text"
                className="flex-1 min-w-0 bg-transparent text-sm text-text-primary py-1 px-0 border-0 border-b border-transparent focus:border-border focus:outline-none"
                onChange={(e) => updateItemText(index, e.target.value)}
              />

              {/* Duplicate button */}
              <button
                type="button"
                title={t('habits.form.duplicateChecklistItem')}
                className="shrink-0 p-1 text-text-muted hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                onClick={() => duplicateItem(index)}
              >
                <Copy className="size-3.5" />
              </button>

              {/* Delete button */}
              <button
                type="button"
                className="shrink-0 p-1 text-text-muted hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                onClick={() => removeItem(index)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* Items list (interactive / read-only) */
        <div className="space-y-1">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 group py-1">
              {interactive ? (
                <label className="shrink-0 cursor-pointer">
                  <input
                    checked={item.isChecked}
                    type="checkbox"
                    aria-label={item.text}
                    className="sr-only"
                    onChange={() => handleToggle(index)}
                  />
                  <span
                    className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      item.isChecked
                        ? 'bg-primary border-primary'
                        : 'border-border hover:border-primary/60'
                    } ${justCheckedIndex === index ? 'animate-check-pop' : ''}`}
                  >
                    {item.isChecked && <Check className="size-3 text-white" />}
                  </span>
                </label>
              ) : null}

              {/* Text */}
              <span
                className={`flex-1 min-w-0 text-sm transition-all ${
                  item.isChecked
                    ? 'text-text-muted line-through'
                    : 'text-text-primary'
                }`}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Clear all (editable mode only) */}
      {editable && items.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-[10px] font-semibold text-red-400 hover:text-red-500 transition-colors"
            onClick={clearAll}
          >
            {t('habits.form.clearChecklist')}
          </button>
        </div>
      )}

      {/* Add item (editable mode only) */}
      {editable && (
        <div className="flex">
          <input
            value={newItemText}
            type="text"
            placeholder={t('habits.form.checklistPlaceholder')}
            className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted py-2 px-3 text-sm border border-border rounded-l-xl border-r-0 focus:outline-none focus:ring-2 focus:ring-primary/30"
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 px-4 py-2 rounded-r-xl bg-primary text-white text-xs font-bold disabled:opacity-40 hover:bg-primary/90 transition-all duration-150"
            disabled={!newItemText.trim()}
            onClick={addItem}
          >
            {t('common.add')}
          </button>
        </div>
      )}
    </div>
  )
}
