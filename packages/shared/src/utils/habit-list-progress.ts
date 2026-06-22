import type { NormalizedHabit } from '../types/habit'

export interface HabitDateBucket {
  key: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

/**
 * Buckets the All-view's top-level habits into an overdue section plus
 * per-due-date sections (label-less; callers format the label per platform).
 *
 * Overdue membership follows the authoritative `isOverdue` flag rather than a
 * raw `dueDate < today` check, so an always-due daily habit whose `DueDate` has
 * gone stale is NOT mislabelled overdue (it is surfaced under today). A
 * non-overdue habit whose `DueDate` already slipped into the past is clamped to
 * today; genuinely missed habits (weekly/one-time) keep `isOverdue` and sort
 * into the overdue section.
 */
export function buildHabitDateBuckets(
  habits: NormalizedHabit[],
  today: string,
): HabitDateBucket[] {
  const overdue: NormalizedHabit[] = []
  const groups = new Map<string, NormalizedHabit[]>()

  for (const habit of habits) {
    if (!habit.isCompleted && habit.isOverdue) {
      overdue.push(habit)
      continue
    }

    const due = habit.dueDate ?? ''
    if (!due) {
      const group = groups.get('') ?? []
      group.push(habit)
      groups.set('', group)
      continue
    }

    const key = due < today ? today : due
    const group = groups.get(key) ?? []
    group.push(habit)
    groups.set(key, group)
  }

  const result: HabitDateBucket[] = []

  if (overdue.length > 0) {
    result.push({
      key: '__overdue__',
      isOverdue: true,
      habits: [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    })
  }

  for (const [key, groupHabits] of Array.from(groups.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    result.push({ key, isOverdue: false, habits: groupHabits })
  }

  return result
}

export interface ParentPromptProgress {
  done: number
  total: number
  loggedDone: number
}

export interface ParentPromptProgressOptions {
  parentId: string
  getChildren: (parentId: string) => NormalizedHabit[]
  isRelevantToday: (habit: NormalizedHabit) => boolean
  isDueOnSelectedDate: (habit: NormalizedHabit) => boolean
  isListView: boolean
  skippedIds: ReadonlySet<string>
  assumeCompletedId?: string
}

/**
 * Aggregates a parent habit's sub-habit resolution for the auto-resolve-parent
 * prompt. A sub-habit counts toward `total` when it is due today, overdue,
 * already logged, or was just skipped; it counts toward `done` when logged,
 * completed, skipped, or matching `assumeCompletedId`. `loggedDone` tracks how
 * many of the done sub-habits were resolved by logging rather than skipping, so
 * the caller can offer to LOG the parent (any logged) or SKIP it (all skipped).
 *
 * Counting overdue and just-skipped sub-habits keeps the count stable across the
 * optimistic-update/refetch window, so the prompt no longer fires after only one
 * of several overdue siblings is logged, and reliably fires once every sub-habit
 * is resolved.
 */
export function computeParentPromptProgress(
  options: ParentPromptProgressOptions,
): ParentPromptProgress {
  const {
    parentId,
    getChildren,
    isRelevantToday,
    isDueOnSelectedDate,
    isListView,
    skippedIds,
    assumeCompletedId,
  } = options

  function computeChild(child: NormalizedHabit): ParentPromptProgress {
    let done = 0
    let total = 0
    let loggedDone = 0

    const isSkipped = skippedIds.has(child.id)
    const isResolved =
      child.isCompleted ||
      child.isLoggedInRange ||
      child.id === assumeCompletedId ||
      isSkipped
    const countsForDay =
      isListView ||
      child.isGeneral ||
      isDueOnSelectedDate(child) ||
      child.isOverdue ||
      child.isLoggedInRange ||
      isSkipped

    if (
      !isListView &&
      !child.isGeneral &&
      !isRelevantToday(child) &&
      !child.isOverdue &&
      !child.isLoggedInRange &&
      !isSkipped
    ) {
      return computeNested(child.id)
    }

    if (countsForDay) {
      total += 1
      if (isResolved) {
        done += 1
        if (!isSkipped) loggedDone += 1
      }
    }

    const nested = computeNested(child.id)
    done += nested.done
    total += nested.total
    loggedDone += nested.loggedDone
    return { done, total, loggedDone }
  }

  function computeNested(currentParentId: string): ParentPromptProgress {
    let done = 0
    let total = 0
    let loggedDone = 0
    for (const child of getChildren(currentParentId)) {
      const progress = computeChild(child)
      done += progress.done
      total += progress.total
      loggedDone += progress.loggedDone
    }
    return { done, total, loggedDone }
  }

  return computeNested(parentId)
}
