import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHabitForm } from '@/hooks/use-habit-form'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('useHabitForm', () => {
  describe('default state', () => {
    it('starts as one-time by default', () => {
      const { result } = renderHook(() => useHabitForm())

      expect(result.current.isOneTime).toBe(true)
      expect(result.current.isRecurring).toBe(false)
      expect(result.current.isGeneral).toBe(false)
      expect(result.current.isFlexible).toBe(false)
    })

    it('has empty title and description', () => {
      const { result } = renderHook(() => useHabitForm())
      const values = result.current.form.getValues()

      expect(values.title).toBe('')
      expect(values.description).toBe('')
    })
  })

  describe('initial data', () => {
    it('initializes with provided data', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: {
            title: 'Exercise',
            frequencyUnit: 'Day',
            frequencyQuantity: 1,
          },
        }),
      )

      const values = result.current.form.getValues()
      expect(values.title).toBe('Exercise')
      expect(values.frequencyUnit).toBe('Day')
      expect(values.frequencyQuantity).toBe(1)
      expect(result.current.isRecurring).toBe(true)
      expect(result.current.isOneTime).toBe(false)
    })
  })

  describe('mode switchers', () => {
    it('setOneTime clears frequency and sets one-time mode', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: { frequencyUnit: 'Day', frequencyQuantity: 1 },
        }),
      )

      act(() => {
        result.current.setOneTime()
      })

      expect(result.current.isOneTime).toBe(true)
      expect(result.current.isRecurring).toBe(false)
      expect(result.current.form.getValues('frequencyUnit')).toBeNull()
    })

    it('setRecurring sets Day/1 if no frequency exists', () => {
      const { result } = renderHook(() => useHabitForm())

      act(() => {
        result.current.setRecurring()
      })

      expect(result.current.isRecurring).toBe(true)
      expect(result.current.form.getValues('frequencyUnit')).toBe('Day')
      expect(result.current.form.getValues('frequencyQuantity')).toBe(1)
    })

    it('setFlexible sets flexible mode with Week/3', () => {
      const { result } = renderHook(() => useHabitForm())

      act(() => {
        result.current.setFlexible()
      })

      expect(result.current.isFlexible).toBe(true)
      expect(result.current.form.getValues('frequencyUnit')).toBe('Week')
      expect(result.current.form.getValues('frequencyQuantity')).toBe(3)
    })

    it('setGeneral resets times and reminders', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: {
            frequencyUnit: 'Day',
            frequencyQuantity: 1,
            dueTime: '09:00',
            reminderEnabled: true,
          },
        }),
      )

      act(() => {
        result.current.setGeneral()
      })

      expect(result.current.isGeneral).toBe(true)
      expect(result.current.form.getValues('dueTime')).toBe('')
      expect(result.current.form.getValues('reminderEnabled')).toBe(false)
      expect(result.current.form.getValues('frequencyUnit')).toBeNull()
    })
  })

  describe('computed flags', () => {
    it('showDayPicker is true for daily frequency of 1', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: { frequencyUnit: 'Day', frequencyQuantity: 1 },
        }),
      )

      expect(result.current.showDayPicker).toBe(true)
    })

    it('showDayPicker is false for weekly frequency', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: { frequencyUnit: 'Week', frequencyQuantity: 1 },
        }),
      )

      expect(result.current.showDayPicker).toBe(false)
    })

    it('showEndDate is true for recurring habits', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: { frequencyUnit: 'Day', frequencyQuantity: 1 },
        }),
      )

      expect(result.current.showEndDate).toBe(true)
    })

    it('showEndDate is false for one-time habits', () => {
      const { result } = renderHook(() => useHabitForm())
      expect(result.current.showEndDate).toBe(false)
    })
  })

  describe('toggleDay', () => {
    it('adds day to selection', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: { frequencyUnit: 'Day', frequencyQuantity: 1 },
        }),
      )

      act(() => {
        result.current.toggleDay('Monday')
      })

      expect(result.current.form.getValues('days')).toContain('Monday')
    })

    it('removes day from selection', () => {
      const { result } = renderHook(() =>
        useHabitForm({
          initialData: {
            frequencyUnit: 'Day',
            frequencyQuantity: 1,
            days: ['Monday', 'Wednesday'],
          },
        }),
      )

      act(() => {
        result.current.toggleDay('Monday')
      })

      expect(result.current.form.getValues('days')).toEqual(['Wednesday'])
    })
  })

  describe('daysList', () => {
    it('starts with Monday for weekStartDay=1', () => {
      const { result } = renderHook(() => useHabitForm({ weekStartDay: 1 }))
      expect(result.current.daysList[0]!.value).toBe('Monday')
    })

    it('starts with Sunday for weekStartDay=0', () => {
      const { result } = renderHook(() => useHabitForm({ weekStartDay: 0 }))
      expect(result.current.daysList[0]!.value).toBe('Sunday')
    })

    it('has 7 days', () => {
      const { result } = renderHook(() => useHabitForm())
      expect(result.current.daysList).toHaveLength(7)
    })
  })

  describe('frequencyUnits', () => {
    it('provides Day, Week, Month, Year options', () => {
      const { result } = renderHook(() => useHabitForm())
      const values = result.current.frequencyUnits.map((u) => u.value)

      expect(values).toEqual(['Day', 'Week', 'Month', 'Year'])
    })
  })

  describe('formatTimeInput', () => {
    it('formats digits with colon after 2 digits', () => {
      const { result } = renderHook(() => useHabitForm())

      expect(result.current.formatTimeInput('09')).toBe('09')
      expect(result.current.formatTimeInput('093')).toBe('09:3')
      expect(result.current.formatTimeInput('0930')).toBe('09:30')
    })

    it('strips non-digit characters', () => {
      const { result } = renderHook(() => useHabitForm())
      expect(result.current.formatTimeInput('09:30')).toBe('09:30')
    })

    it('limits to 4 digits', () => {
      const { result } = renderHook(() => useHabitForm())
      expect(result.current.formatTimeInput('123456')).toBe('12:34')
    })
  })
})
