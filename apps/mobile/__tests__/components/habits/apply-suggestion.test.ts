import { describe, expect, it, vi } from 'vitest'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { applySuggestionChecklist } from '@/components/habits/create-habit-modal/apply-suggestion'

describe('applySuggestionChecklist mobile', () => {
  it('caps an Astra checklist proposal at the shared limit', () => {
    const existing = Array.from({ length: 49 }, (_, index) => ({ text: `Item ${index}`, isChecked: false }))
    const setValue = vi.fn()
    const form = { getValues: () => existing, setValue } as unknown as HabitFormHelpers['form']

    expect(applySuggestionChecklist({ mode: 'oneTime', frequencyUnit: null, frequencyQuantity: null, days: [], dueTime: null, emoji: null, subHabitTitles: [], checklistItems: [{ text: 'One', isChecked: false }, { text: 'Two', isChecked: false }] }, form)).toBe(true)
    expect(setValue.mock.calls[0]?.[1]).toHaveLength(50)
  })
})
