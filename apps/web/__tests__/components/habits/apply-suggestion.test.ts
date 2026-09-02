import { describe, expect, it, vi } from 'vitest'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { applySuggestionChecklist, applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'

describe('applySuggestionChecklist', () => {
  it('caps an Astra checklist proposal at the shared limit', () => {
    const existing = Array.from({ length: 49 }, (_, index) => ({ text: `Item ${index}`, isChecked: false }))
    const setValue = vi.fn()
    const form = { getValues: () => existing, setValue } as unknown as HabitFormHelpers['form']

    expect(applySuggestionChecklist({ mode: 'oneTime', frequencyUnit: null, frequencyQuantity: null, days: [], dueTime: null, emoji: null, subHabitTitles: [], checklistItems: [{ text: 'One', isChecked: false }, { text: 'Two', isChecked: false }] }, form)).toBe(true)
    expect(setValue.mock.calls[0]?.[1]).toHaveLength(50)
  })

  it('reports a setup proposal only when Astra changes a form value', () => {
    const setValue = vi.fn()
    const target = {
      form: {
        getValues: (field: string) => ({
          emoji: '🏊',
          frequencyUnit: 'Week',
          frequencyQuantity: 3,
          days: [],
          dueTime: '07:00',
        })[field],
        setValue,
      },
      isOneTime: false,
      isRecurring: false,
      isFlexible: true,
      isGeneral: false,
      setFlexible: vi.fn(),
      setRecurring: vi.fn(),
      setOneTime: vi.fn(),
    } as unknown as HabitFormHelpers
    const patch = {
      mode: 'flexible' as const,
      frequencyUnit: 'Week' as const,
      frequencyQuantity: 3,
      days: [],
      dueTime: '07:00',
      emoji: '🏊',
      subHabitTitles: [],
      checklistItems: [],
    }

    expect(applySuggestionSchedule(patch, target)).toBe(false)
    expect(applySuggestionSchedule({ ...patch, dueTime: '08:00' }, target)).toBe(true)
  })
})
