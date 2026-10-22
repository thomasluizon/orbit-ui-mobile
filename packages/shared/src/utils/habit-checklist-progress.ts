import type { NormalizedHabit } from '../types/habit'

export function getHabitChecklistProgress({ checklistItems }: Pick<NormalizedHabit, 'checklistItems'>): { done: number; total: number } | undefined {
  if (checklistItems.length === 0) return undefined
  return {
    done: checklistItems.filter((item) => item.isChecked).length,
    total: checklistItems.length,
  }
}
