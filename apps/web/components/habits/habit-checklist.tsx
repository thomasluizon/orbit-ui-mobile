'use client'

import { useState, useRef, useCallback, useId } from 'react'
import { GripHorizontal, X, Copy, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
}: Readonly<HabitChecklistProps>) {
  const t = useTranslations()
  const newItemInputId = useId()
  const [newItemText, setNewItemText] = useState('')
  const [justCheckedIndex, setJustCheckedIndex] = useState(-1)
  const checkPopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const checkedCount = items.filter((i) => i.isChecked).length

  // -- Drag-to-reorder (editable mode) --
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // Stable IDs for sortable context (index-based since checklist items have no unique id)
  const sortableIds = items.map((_, i) => `checklist-${i}`)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = sortableIds.indexOf(active.id as string)
      const newIndex = sortableIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      onItemsChange?.(arrayMove(items, oldIndex, newIndex))
    },
    [items, sortableIds, onItemsChange],
  )

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
          <div className="flex-1 relative">
            <progress
              className="sr-only"
              value={items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0}
              max={100}
              aria-label={`${checkedCount}/${items.length}`}
            />
            <div
              className="h-1.5 bg-surface-elevated rounded-full overflow-hidden"
              aria-hidden="true"
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{
                  width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <span className="text-[10px] font-bold text-text-muted tabular-nums" aria-hidden="true">
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

      {/* Items list (editable) with drag-to-reorder */}
      {editable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((item, index) => (
                <SortableChecklistItem
                  key={sortableIds[index]}
                  id={sortableIds[index]!}
                  item={item}
                  index={index}
                  onUpdateText={updateItemText}
                  onDuplicate={duplicateItem}
                  onRemove={removeItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        /* Items list (interactive / read-only) */
        <div className="space-y-1">
          {items.map((item, index) => (
            <div key={`${item.text}-${index}`} className="flex items-center gap-2 group py-1">
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
                    aria-hidden="true"
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
          <label htmlFor={newItemInputId} className="sr-only">
            {t('habits.form.checklistPlaceholder')}
          </label>
          <input
            id={newItemInputId}
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

// ---------------------------------------------------------------------------
// Sortable checklist item (editable mode)
// ---------------------------------------------------------------------------

function SortableChecklistItem({
  id,
  item,
  index,
  onUpdateText,
  onDuplicate,
  onRemove,
}: Readonly<{
  id: string
  item: ChecklistItem
  index: number
  onUpdateText: (index: number, text: string) => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
}>) {
  const t = useTranslations()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group py-0.5"
      {...attributes}
    >
      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden="true"
        className="checklist-drag-handle shrink-0 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary transition-colors touch-none"
      >
        <GripHorizontal className="size-3.5" />
      </div>

      {/* Static checkbox indicator */}
      <div aria-hidden="true" className="shrink-0 size-4 rounded border-2 border-border" />

      {/* Text input */}
      <input
        value={item.text}
        type="text"
        aria-label={t('habits.form.checklistItemLabel', { n: index + 1 })}
        className="flex-1 min-w-0 bg-transparent text-sm text-text-primary py-1 px-0 border-0 border-b border-transparent focus:border-border focus:outline-none"
        onChange={(e) => onUpdateText(index, e.target.value)}
      />

      {/* Duplicate button */}
      <button
        type="button"
        aria-label={t('habits.form.duplicateChecklistItem')}
        className="shrink-0 p-1 text-text-muted hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 transition-all"
        onClick={() => onDuplicate(index)}
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>

      {/* Delete button */}
      <button
        type="button"
        aria-label={t('habits.form.removeChecklistItem')}
        className="shrink-0 p-1 text-text-muted hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
        onClick={() => onRemove(index)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
