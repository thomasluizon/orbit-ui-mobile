import type { NormalizedHabit } from '../types/habit'
import { computeHabitDayProgress } from '../utils/habit-list-progress'
import type { HabitVisibilityView } from '../utils/habit-visibility'
import { addRecentCompletion,removeRecentCompletion } from '../utils/drill-navigation'
import type { StateSetter } from './state-adapter'

export function computeHabitChildrenProgress(habitsById: ReadonlyMap<string, NormalizedHabit>, getChildren: (id: string) => NormalizedHabit[], visibility: { isDueOnSelectedDate: (habit: NormalizedHabit) => boolean }, view: HabitVisibilityView) {
    const map = new Map<string, { done: number; total: number }>()

    function computeChildProgress(
      child: NormalizedHabit,
      computeFn: (id: string) => { done: number; total: number },
    ): { done: number; total: number } {
      const ownProgress = computeHabitDayProgress([child], visibility.isDueOnSelectedDate, view)
      const nested = computeFn(child.id)
      return { done: ownProgress.done + nested.done, total: ownProgress.total + nested.total }
    }

    function compute(habitId: string): { done: number; total: number } {
      const cached = map.get(habitId)
      if (cached) return cached

      const children = getChildren(habitId)
      if (children.length === 0) {
        const result = { done: 0, total: 0 }
        map.set(habitId, result)
        return result
      }

      let done = 0
      let total = 0
      for (const child of children) {
        const progress = computeChildProgress(child, compute)
        done += progress.done
        total += progress.total
      }

      const result = { done, total }
      map.set(habitId, result)
      return result
    }

    for (const habit of habitsById.values()) {
      if (!map.has(habit.id)) {
        compute(habit.id)
      }
    }

    return map
}

interface RecentCompletionAdapters {
  useRef: <Value>(value: Value) => { current: Value }
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]) => Callback
}

export function createUseHabitRecentCompletions({ useRef, useEffect, useCallback }: RecentCompletionAdapters, duration: number) {
return function useHabitRecentCompletions({ selectedDateStr, setRecentlyCompletedDates }: { selectedDateStr: string; setRecentlyCompletedDates: StateSetter<Map<string, Set<string>>> }) {
  const recentlyCompletedTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  )

  useEffect(() => {
    const timers = recentlyCompletedTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const markRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    setRecentlyCompletedDates((prev) => addRecentCompletion(prev, habitId, date))
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) clearTimeout(existing)
    timers.set(
      timerKey,
      setTimeout(() => {
        timers.delete(timerKey)
        setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
      }, duration),
    )
  }, [selectedDateStr, setRecentlyCompletedDates])

  const clearRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      timers.delete(timerKey)
    }
    setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
  }, [selectedDateStr, setRecentlyCompletedDates])
  return { recentlyCompletedTimersRef, markRecentlyCompleted, clearRecentlyCompleted }
}

}
