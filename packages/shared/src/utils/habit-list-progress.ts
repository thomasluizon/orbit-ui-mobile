import type { NormalizedHabit } from '../types/habit'
import { hasHabitScheduleOnDate } from './habits'

export interface ParentPromptProgress {
  done: number
  total: number
  loggedDone: number
}

export type HabitResolutionMode = 'log' | 'skip'

export interface HabitResolution {
  habitId: string
  mode: HabitResolutionMode
}

export interface ParentPromptProgressOptions {
  parentId: string
  getChildren: (parentId: string) => NormalizedHabit[]
  isRelevantToday: (habit: NormalizedHabit) => boolean
  isDueOnSelectedDate: (habit: NormalizedHabit) => boolean
  skippedIds: ReadonlySet<string>
  resolvedModes?: ReadonlyMap<string, HabitResolutionMode>
}

export type ParentSettlementDecision = 'log' | 'skip' | null

export function computeParentSettlementDecision(
  parent: NormalizedHabit | null,
  children: ParentPromptProgress,
  promptDate: string,
): ParentSettlementDecision {
  if (
    !parent ||
    (!parent.isGeneral &&
      !parent.isOverdue &&
      !hasHabitScheduleOnDate(parent, promptDate))
  ) {
    return null
  }

  const isSkippedInRange =
    parent.flexibleTarget != null &&
    parent.flexibleCompleted != null &&
    parent.flexibleCompleted >= parent.flexibleTarget &&
    !parent.isLoggedInRange

  if (
    parent.isCompleted ||
    parent.isLoggedInRange ||
    isSkippedInRange ||
    children.total === 0 ||
    children.done < children.total
  ) {
    return null
  }

  return children.loggedDone > 0 ? 'log' : 'skip'
}

/**
 * Aggregates a parent habit's sub-habit resolution for the auto-resolve-parent prompt. A
 * sub-habit counts toward `total` when it is due today, overdue, already logged, or was just
 * skipped; it counts toward `done` when logged, completed, skipped, or present in
 * `resolvedModes`.
 */
export function computeParentPromptProgress(
  options: ParentPromptProgressOptions,
): ParentPromptProgress {
  const {
    parentId,
    getChildren,
    isRelevantToday,
    isDueOnSelectedDate,
    skippedIds,
    resolvedModes,
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
    const resolvedMode = resolvedModes?.get(child.id)
    const isAssumedCompleted = resolvedMode === 'log'
    const isSkipped =
      resolvedMode === 'skip' ||
      (resolvedMode == null && (skippedIds.has(child.id) || isServerKnownSkip))
    const isResolved =
      child.isCompleted ||
      child.isLoggedInRange ||
      isAssumedCompleted ||
      isSkipped
    const countsForDay =
      child.isGeneral ||
      isDueOnSelectedDate(child) ||
      child.isOverdue ||
      child.isLoggedInRange ||
      isAssumedCompleted ||
      isSkipped

    if (
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
