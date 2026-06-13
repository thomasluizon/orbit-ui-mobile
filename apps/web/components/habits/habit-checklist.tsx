'use client'

import { useState, useRef, useCallback, useId } from 'react'
import { GripHorizontal, X, Copy, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
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
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { ProgressBar } from '@/components/ui/progress-bar'

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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
    <div className="space-y-3">
      {items.length > 0 && !editable && (
        <div className="flex items-center gap-2">
          <ProgressBar
            progress={items.length > 0 ? checkedCount / items.length : 0}
            label={`${checkedCount}/${items.length}`}
            className="flex-1"
          />
          <span
            className="text-[var(--fg-3)]"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-hidden="true"
          >
            {checkedCount}/{items.length}
          </span>
          {interactive && checkedCount > 0 && (
            <button
              type="button"
              className="text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
              onClick={onReset}
            >
              {t('habits.form.resetChecklist')}
            </button>
          )}
          {interactive && (
            <button
              type="button"
              className="text-[var(--status-bad)] transition-opacity hover:opacity-80"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
              onClick={onClear}
            >
              {t('habits.form.clearChecklist')}
            </button>
          )}
        </div>
      )}

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
        items.length > 0 && (
          <div
            style={{
              borderRadius: 18,
              background: 'var(--bg-card)',
              boxShadow: 'inset 0 0 0 1px var(--hairline)',
              overflow: 'hidden',
            }}
          >
            {items.map((item, index) => (
              <div
                key={`${item.text}-${index}`}
                className="flex items-center gap-[14px]"
                style={{
                  padding: '15px 18px',
                  borderBottom:
                    index < items.length - 1 ? '1px solid var(--hairline)' : 'none',
                }}
              >
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
                      className={`flex items-center justify-center transition-[background-color,box-shadow] ${
                        justCheckedIndex === index ? 'animate-check-pop' : ''
                      }`}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: item.isChecked ? 'var(--primary)' : 'transparent',
                        boxShadow: item.isChecked
                          ? 'none'
                          : 'inset 0 0 0 2px var(--fg-3)',
                      }}
                    >
                      {item.isChecked && (
                        <Check size={15} strokeWidth={3} color="var(--fg-on-primary)" />
                      )}
                    </span>
                  </label>
                ) : null}

                <span
                  className={`flex-1 min-w-0 transition-colors ${
                    item.isChecked
                      ? 'text-[var(--fg-3)] line-through'
                      : 'text-[var(--fg-1)]'
                  }`}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 16 }}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {editable && items.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-[var(--status-bad)] transition-opacity hover:opacity-80"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
            onClick={clearAll}
          >
            {t('habits.form.clearChecklist')}
          </button>
        </div>
      )}

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
            className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] py-2 px-3 text-sm rounded-l-[14px] focus:outline-none"
            style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
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
            className="shrink-0 px-4 py-2 rounded-r-[14px] bg-[var(--primary)] text-[var(--fg-on-primary)] disabled:opacity-40 hover:bg-[var(--primary-pressed)] transition-[background-color,opacity] duration-150"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500 }}
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
      className="flex items-center gap-1.5 group py-0.5"
      {...attributes}
    >
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden="true"
        className="checklist-drag-handle shrink-0 inline-flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing text-[var(--fg-3)] hover:text-[var(--fg-2)] hover:bg-[var(--bg-elev)] transition-[color,background-color] duration-[var(--dur-fast)] touch-none"
        style={{ width: 36, height: 36 }}
      >
        <GripHorizontal size={16} strokeWidth={1.8} />
      </div>

      <div
        aria-hidden="true"
        className="shrink-0"
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          boxShadow: 'inset 0 0 0 2px var(--fg-3)',
        }}
      />

      <input
        value={item.text}
        type="text"
        aria-label={t('habits.form.checklistItemLabel', { n: index + 1 })}
        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--fg-1)] py-1 px-2 border-0 border-b border-transparent focus:border-[var(--hairline)] focus:outline-none"
        onChange={(e) => onUpdateText(index, e.target.value)}
      />

      <button
        type="button"
        aria-label={t('habits.form.duplicateChecklistItem')}
        className="shrink-0 inline-flex items-center justify-center rounded-full text-[var(--fg-3)] hover:text-[var(--primary-pressed)] hover:bg-[var(--bg-elev)] active:scale-[0.92] sm:opacity-0 sm:group-hover:opacity-100 transition-[color,background-color,opacity,transform] duration-[var(--dur-fast)]"
        style={{ width: 36, height: 36 }}
        onClick={() => onDuplicate(index)}
      >
        <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label={t('habits.form.removeChecklistItem')}
        className="shrink-0 inline-flex items-center justify-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] hover:bg-[var(--bg-elev)] active:scale-[0.92] sm:opacity-0 sm:group-hover:opacity-100 transition-[color,background-color,opacity,transform] duration-[var(--dur-fast)]"
        style={{ width: 36, height: 36 }}
        onClick={() => onRemove(index)}
      >
        <X size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}
