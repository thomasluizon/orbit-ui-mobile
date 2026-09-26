import type { NormalizedHabit } from '../types/habit'

export interface HabitDateBucket {
  key: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

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

    const due = habit.dueDate
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

    // WHY: API dateFrom/user-today populates flexible progress; general habits cannot be skipped. https://linear.app/useorbitai/issue/ORB-86
    const isServerKnownSkip =
      child.flexibleTarget != null &&
      child.flexibleCompleted != null &&
      child.flexibleCompleted >= child.flexibleTarget &&
      !child.isLoggedInRange
    const isAssumedCompleted = child.id === assumeCompletedId && !skippedIds.has(child.id)
    const isSkipped = !isAssumedCompleted && (skippedIds.has(child.id) || isServerKnownSkip)
    const isResolved =
      child.isCompleted ||
      child.isLoggedInRange ||
      isAssumedCompleted ||
      isSkipped
    const countsForDay =
      isListView ||
      child.isGeneral ||
      isDueOnSelectedDate(child) ||
      child.isOverdue ||
      child.isLoggedInRange ||
      isAssumedCompleted ||
      isSkipped

    if (
      !isListView &&
      !child.isGeneral &&
      !isRelevantToday(child) &&
      !child.isOverdue &&
      !child.isLoggedInRange &&
      !isAssumedCompleted &&
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
