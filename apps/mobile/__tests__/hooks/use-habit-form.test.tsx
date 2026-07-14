import React from 'react'
import { describe, expect, it } from 'vitest'
import { useHabitForm, type HabitFormHelpers, type HabitFormOptions } from '@/hooks/use-habit-form'

const TestRenderer = require('react-test-renderer')

interface Holder {
  current: HabitFormHelpers
}

function renderHabitForm(options: HabitFormOptions = {}): Holder {
  const holder = { current: null as unknown as HabitFormHelpers }
  function Harness() {
    holder.current = useHabitForm(options)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  return holder
}

function act(callback: () => void): void {
  TestRenderer.act(() => {
    callback()
  })
}

describe('mobile useHabitForm', () => {
  it('starts as a one-time habit with empty defaults', () => {
    const form = renderHabitForm()
    expect(form.current.isOneTime).toBe(true)
    expect(form.current.isRecurring).toBe(false)
    expect(form.current.isFlexible).toBe(false)
    expect(form.current.isGeneral).toBe(false)
    expect(form.current.form.getValues('title')).toBe('')
  })

  it('setRecurring defaults an unset cadence to Day / every 1', () => {
    const form = renderHabitForm()
    act(() => form.current.setRecurring())

    expect(form.current.form.getValues('frequencyUnit')).toBe('Day')
    expect(form.current.form.getValues('frequencyQuantity')).toBe(1)
    expect(form.current.form.getValues('isGeneral')).toBe(false)
    expect(form.current.form.getValues('isFlexible')).toBe(false)
    expect(form.current.isRecurring).toBe(true)
    expect(form.current.showDayPicker).toBe(true)
  })

  it('setRecurring preserves an already-chosen cadence', () => {
    const form = renderHabitForm({
      initialData: { frequencyUnit: 'Week', frequencyQuantity: 5 },
    })
    act(() => form.current.setRecurring())

    expect(form.current.form.getValues('frequencyUnit')).toBe('Week')
    expect(form.current.form.getValues('frequencyQuantity')).toBe(5)
  })

  it('setFlexible defaults to Week / 3, marks the habit flexible, and clears days', () => {
    const form = renderHabitForm({ initialData: { days: ['Monday'] } })
    act(() => form.current.setFlexible())

    expect(form.current.form.getValues('isFlexible')).toBe(true)
    expect(form.current.form.getValues('frequencyUnit')).toBe('Week')
    expect(form.current.form.getValues('frequencyQuantity')).toBe(3)
    expect(form.current.form.getValues('days')).toEqual([])
    expect(form.current.isFlexible).toBe(true)
  })

  it('setGeneral clears cadence, schedule, and reminder fields', () => {
    const form = renderHabitForm({
      initialData: {
        frequencyUnit: 'Day',
        frequencyQuantity: 2,
        days: ['Monday'],
        isBadHabit: true,
        dueTime: '08:00',
        dueEndTime: '09:00',
        endDate: '2026-12-31',
        reminderEnabled: true,
      },
    })
    act(() => form.current.setGeneral())

    expect(form.current.form.getValues('isGeneral')).toBe(true)
    expect(form.current.form.getValues('isFlexible')).toBe(false)
    expect(form.current.form.getValues('isBadHabit')).toBe(false)
    expect(form.current.form.getValues('frequencyUnit')).toBeNull()
    expect(form.current.form.getValues('frequencyQuantity')).toBeNull()
    expect(form.current.form.getValues('days')).toEqual([])
    expect(form.current.form.getValues('dueTime')).toBe('')
    expect(form.current.form.getValues('endDate')).toBe('')
    expect(form.current.form.getValues('reminderEnabled')).toBe(false)
    expect(form.current.isGeneral).toBe(true)
  })

  it('setOneTime clears cadence, days, and end date', () => {
    const form = renderHabitForm({
      initialData: {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: ['Monday'],
        endDate: '2026-12-31',
        isFlexible: true,
      },
    })
    act(() => form.current.setOneTime())

    expect(form.current.form.getValues('frequencyUnit')).toBeNull()
    expect(form.current.form.getValues('frequencyQuantity')).toBeNull()
    expect(form.current.form.getValues('days')).toEqual([])
    expect(form.current.form.getValues('endDate')).toBe('')
    expect(form.current.isOneTime).toBe(true)
  })

  it('toggleDay adds then removes a weekday', () => {
    const form = renderHabitForm()
    act(() => form.current.toggleDay('Monday'))
    expect(form.current.form.getValues('days')).toEqual(['Monday'])

    act(() => form.current.toggleDay('Monday'))
    expect(form.current.form.getValues('days')).toEqual([])
  })

  it('validateAll flags a missing title and clears once one is provided', () => {
    const form = renderHabitForm()
    expect(form.current.validateAll()).toBe('habits.form.titleRequired')

    act(() => form.current.form.setValue('title', 'Read a book'))
    expect(form.current.validateAll()).toBeNull()
  })

  it('builds the weekday list Monday-first by default and Sunday-first when the week starts on Sunday', () => {
    const mondayFirst = renderHabitForm()
    expect(mondayFirst.current.daysList[0]?.value).toBe('Monday')
    expect(mondayFirst.current.frequencyUnits.map((unit) => unit.value)).toEqual([
      'Day',
      'Week',
      'Month',
      'Year',
    ])

    const sundayFirst = renderHabitForm({ weekStartDay: 0 })
    expect(sundayFirst.current.daysList[0]?.value).toBe('Sunday')
  })

  it('formatTimeInput inserts the colon separator', () => {
    const form = renderHabitForm()
    expect(form.current.formatTimeInput('0830')).toBe('08:30')
    expect(form.current.formatEndTimeInput('2159')).toBe('21:59')
  })
})
