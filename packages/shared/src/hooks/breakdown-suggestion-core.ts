import type { SuggestedSubHabit } from '../types/chat'
import type { BulkCreateResponse } from '../types/habit'
import { nextBreakdownCadence, type BreakdownEditableHabit } from '../utils/breakdown-suggestion'

export type BreakdownDraftHabit = BreakdownEditableHabit & { id: string; proposed: boolean }
export type BreakdownItemResult = 'done' | 'failed' | undefined

export function createBreakdownDraft(id: string, source?: SuggestedSubHabit): BreakdownDraftHabit {
  return {
    id,
    proposed: source !== undefined,
    title: source?.title ?? '',
    description: source?.description ?? '',
    frequencyUnit: source?.frequencyUnit ?? null,
    frequencyQuantity: source?.frequencyQuantity ?? null,
    days: source?.days ?? null,
    isBadHabit: source?.isBadHabit ?? false,
    dueDate: source?.dueDate ?? null,
    checklistItems: source?.checklistItems ?? null,
  }
}

export function createBreakdownDrafts(subHabits: readonly SuggestedSubHabit[]): BreakdownDraftHabit[] {
  return subHabits.map((habit, index) => createBreakdownDraft(`proposal-${index}`, habit))
}

export function editBreakdownTitle(habits: BreakdownDraftHabit[], id: string, title: string): BreakdownDraftHabit[] {
  return habits.map((habit) => habit.id === id ? { ...habit, title } : habit)
}

export function cycleBreakdownCadence(habits: BreakdownDraftHabit[], id: string): BreakdownDraftHabit[] {
  return habits.map((habit) => habit.id === id
    ? { ...habit, frequencyUnit: nextBreakdownCadence(habit.frequencyUnit) }
    : habit)
}

export function mergeBreakdownResults(
  results: Record<string, BreakdownItemResult>,
  selected: BreakdownDraftHabit[],
  response: BulkCreateResponse,
  createAsParent = false,
): Record<string, BreakdownItemResult> {
  const nextResults = { ...results }
  response.results.forEach((result) => {
    const affected = createAsParent ? (result.index === 0 ? selected : []) : selected.slice(result.index, result.index + 1)
    affected.forEach((habit) => {
      nextResults[habit.id] = result.status === 'Success' ? 'done' : 'failed'
    })
  })
  return nextResults
}

export function getFailedBreakdownIds(
  habits: BreakdownDraftHabit[],
  results: Record<string, BreakdownItemResult>,
): string[] {
  return habits.filter((habit) => results[habit.id] === 'failed').map((habit) => habit.id)
}

export function selectBreakdownHabits(
  habits: BreakdownDraftHabit[],
  onlyIds?: readonly string[],
): BreakdownDraftHabit[] {
  return onlyIds ? habits.filter((habit) => onlyIds.includes(habit.id)) : habits
}

export function failBreakdownResults(
  results: Record<string, BreakdownItemResult>,
  selected: BreakdownDraftHabit[],
): Record<string, BreakdownItemResult> {
  return { ...results, ...Object.fromEntries(selected.map((habit) => [habit.id, 'failed' as const])) }
}
