import { describe, expect, it } from 'vitest'
import { stripHabitListDirective } from '../chat'

describe('stripHabitListDirective', () => {
  it('removes a complete today directive and surrounding whitespace', () => {
    expect(stripHabitListDirective('Here are your habits for today:\n[[orbit:habits:today]]')).toBe(
      'Here are your habits for today:',
    )
  })

  it('removes a complete all directive', () => {
    expect(stripHabitListDirective('All of them:\n[[orbit:habits:all]]')).toBe('All of them:')
  })

  it('removes a partial directive still being streamed', () => {
    expect(stripHabitListDirective('Here you go:\n[[orbit:habits:tod')).toBe('Here you go:')
    expect(stripHabitListDirective('Here you go:\n[[orbit:habits')).toBe('Here you go:')
  })

  it('leaves ordinary content untouched', () => {
    expect(stripHabitListDirective('You have 3 habits due today.')).toBe('You have 3 habits due today.')
  })
})
