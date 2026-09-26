import type { SuggestedSubHabit } from '../types/chat'
import type { BulkCreateResponse } from '../types/habit'
import { nextBreakdownCadence, type BreakdownEditableHabit } from '../utils/breakdown-suggestion'

export type BreakdownDraftHabit = BreakdownEditableHabit & { id: string }
export type BreakdownItemResult = 'done' | 'failed' | undefined

export function createBreakdownDrafts(subHabits: readonly SuggestedSubHabit[]): BreakdownDraftHabit[] {
  return subHabits.map((habit, index) => ({
    id: `proposal-${index}`,
    title: habit.title,
    description: habit.description ?? '',
    frequencyUnit: habit.frequencyUnit ?? null,
    frequencyQuantity: habit.frequencyQuantity ?? null,
    days: habit.days ?? null,
    isBadHabit: habit.isBadHabit ?? false,
    dueDate: habit.dueDate ?? null,
    checklistItems: habit.checklistItems ?? null,
  }))
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
): Record<string, BreakdownItemResult> {
  const nextResults = { ...results }
  response.results.forEach((result) => {
    const habit = selected[result.index]
    if (habit) nextResults[habit.id] = result.status === 'Success' ? 'done' : 'failed'
  })
  return nextResults
}
