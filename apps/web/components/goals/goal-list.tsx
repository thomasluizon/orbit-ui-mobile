'use client'

import { useRef, useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { arrayMove } from '@dnd-kit/sortable'
import { GoalCard } from './goal-card'
import { GoalDetailDrawer, type GoalDrawerInitialAction } from './goal-detail-drawer'
import { useReorderGoals } from '@/hooks/use-goals'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'

interface GoalListProps {
  goals: Goal[]
  selectedId?: string | null
  onSelect?: (goalId: string) => void
}

/** Delay before touch drag starts (ms). */
const TOUCH_HOLD_DELAY = 300

/** Minimum movement (px) before cancelling hold. */
const TOUCH_MOVE_THRESHOLD = 5

export function GoalList({ goals, selectedId, onSelect }: Readonly<GoalListProps>) {
  const t = useTranslations()
  const listRef = useRef<HTMLDivElement>(null)
  const reorderGoals = useReorderGoals()

  const dragItemRef = useRef<number | null>(null)
  const dragOverItemRef = useRef<number | null>(null)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const touchDragging = useRef(false)
  const touchItemRef = useRef<HTMLElement | null>(null)

  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailAction, setDetailAction] = useState<GoalDrawerInitialAction | null>(null)

  const handleOpenDetail = useCallback(
    (goalId: string, initialAction: GoalDrawerInitialAction | null) => {
      setDetailGoalId(goalId)
      setDetailAction(initialAction)
      setDetailOpen(true)
    },
    [],
  )

  const commitReorder = useCallback(() => {
    if (
      dragItemRef.current === null ||
      dragOverItemRef.current === null ||
      dragItemRef.current === dragOverItemRef.current
    ) {
      dragItemRef.current = null
      dragOverItemRef.current = null
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const reordered = arrayMove(goals, dragItemRef.current, dragOverItemRef.current)

    const positions: GoalPositionItem[] = reordered.map((g, i) => ({
      id: g.id,
      position: i,
    }))

    reorderGoals.mutate(positions)

    dragItemRef.current = null
    dragOverItemRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }, [goals, reorderGoals])

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index
    setDragIndex(index)
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    dragOverItemRef.current = index
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    commitReorder()
  }, [commitReorder])

  const clearTouchTimer = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }, [])

  const getItemIndexFromPoint = useCallback((x: number, y: number): number | null => {
    const list = listRef.current
    if (!list) return null
    const children = Array.from(list.children) as HTMLElement[]
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (!child) continue
      const rect = child.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        return i
      }
    }
    return null
  }, [])

  const handleTouchStart = useCallback(
    (index: number, e: React.TouchEvent<HTMLElement>) => {
      const touch = e.touches[0]
      if (!touch) return
      touchStartPos.current = { x: touch.clientX, y: touch.clientY }
      touchItemRef.current = e.currentTarget

      touchTimerRef.current = setTimeout(() => {
        touchDragging.current = true
        dragItemRef.current = index
        setDragIndex(index)
      }, TOUCH_HOLD_DELAY)
    },
    [],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const touch = e.touches[0]
      if (!touch) return

      if (!touchDragging.current && touchStartPos.current) {
        const dx = Math.abs(touch.clientX - touchStartPos.current.x)
        const dy = Math.abs(touch.clientY - touchStartPos.current.y)
        if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
          clearTouchTimer()
          return
        }
      }

      if (!touchDragging.current) return

      e.preventDefault()

      const overIndex = getItemIndexFromPoint(touch.clientX, touch.clientY)
      if (overIndex !== null) {
        dragOverItemRef.current = overIndex
        setDragOverIndex(overIndex)
      }
    },
    [clearTouchTimer, getItemIndexFromPoint],
  )

  const handleTouchEnd = useCallback(() => {
    clearTouchTimer()
    if (touchDragging.current) {
      touchDragging.current = false
      commitReorder()
    }
    touchStartPos.current = null
    touchItemRef.current = null
  }, [clearTouchTimer, commitReorder])

  const getDragClasses = useCallback(
    (index: number): string => {
      if (dragIndex === null) return ''
      if (index === dragIndex) return 'drag-chosen'
      if (index === dragOverIndex) return 'drag-ghost'
      return ''
    },
    [dragIndex, dragOverIndex],
  )

  return (
    <>
      <div ref={listRef} className="space-y-3 stagger-enter">
        {goals.map((goal, index) => (
          <section
            key={goal.id}
            aria-roledescription={t('goals.dragItem')}
            aria-label={goal.title}
            draggable
            className={getDragClasses(index)}
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onTouchStart={(e) => handleTouchStart(index, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <GoalCard
              goal={goal}
              selected={onSelect !== undefined && goal.id === selectedId}
              onSelect={onSelect}
              onOpenDetail={handleOpenDetail}
            />
          </section>
        ))}
      </div>

      {detailGoalId ? (
        <GoalDetailDrawer
          open={detailOpen}
          onOpenChange={(nextOpen) => {
            setDetailOpen(nextOpen)
            if (!nextOpen) setDetailAction(null)
          }}
          goalId={detailGoalId}
          initialAction={detailAction}
        />
      ) : null}
    </>
  )
}
