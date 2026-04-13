import { describe, it, expect } from 'vitest'
import {
  TOUR_STEPS,
  getTourStepsBySection,
  getSectionStepCount,
} from '../tour/tour-steps'
import type { TourSection } from '../types/tour'

describe('TOUR_STEPS', () => {
  it('contains at least one step', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0)
  })

  it('every step has required properties', () => {
    for (const step of TOUR_STEPS) {
      expect(step.id).toBeDefined()
      expect(typeof step.id).toBe('string')
      expect(step.section).toBeDefined()
      expect(step.targetId).toBeDefined()
      expect(step.titleKey).toBeDefined()
      expect(step.descriptionKey).toBeDefined()
      expect(step.placement).toBeDefined()
      expect(step.route).toBeDefined()
    }
  })

  it('has unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('getTourStepsBySection', () => {
  it('returns only steps for the given section', () => {
    const habitsSteps = getTourStepsBySection('habits')
    expect(habitsSteps.length).toBeGreaterThan(0)
    expect(habitsSteps.every((s) => s.section === 'habits')).toBe(true)
  })

  it('returns steps for goals section', () => {
    const goalsSteps = getTourStepsBySection('goals')
    expect(goalsSteps.length).toBeGreaterThan(0)
    expect(goalsSteps.every((s) => s.section === 'goals')).toBe(true)
  })

  it('returns empty array for unknown section', () => {
    const steps = getTourStepsBySection('nonexistent' as TourSection)
    expect(steps).toEqual([])
  })
})

describe('getSectionStepCount', () => {
  it('returns correct count for habits section', () => {
    const count = getSectionStepCount('habits')
    const expected = TOUR_STEPS.filter((s) => s.section === 'habits').length
    expect(count).toBe(expected)
  })

  it('returns 0 for unknown section', () => {
    expect(getSectionStepCount('nonexistent' as TourSection)).toBe(0)
  })

  it('sum of all section counts equals total steps', () => {
    const sections = new Set(TOUR_STEPS.map((s) => s.section))
    let total = 0
    for (const section of sections) {
      total += getSectionStepCount(section)
    }
    expect(total).toBe(TOUR_STEPS.length)
  })
})
