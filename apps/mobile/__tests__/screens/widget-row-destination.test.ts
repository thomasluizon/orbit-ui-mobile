import { describe, expect, it } from 'vitest'
import { redirectSystemPath } from '@/app/+native-intent'

const HABIT_ID = 'a12b34cd-1234-4567-89ab-123456789abc'

describe('an Android widget row opens what it shows', () => {
  it.each([true, false])(
    'keeps the habit and the day on a cold start of %s',
    (initial) => {
      const path = `orbit://habits/${HABIT_ID}?date=2026-09-20`

      expect(redirectSystemPath({ path, initial })).toBe(path)
    },
  )

  it('keeps a day that is not today, so the tomorrow fallback opens tomorrow', () => {
    const tomorrow = `orbit://habits/${HABIT_ID}?date=2027-03-01`

    expect(redirectSystemPath({ path: tomorrow, initial: true })).toBe(tomorrow)
  })

  it.each([
    'not-a-date',
    '2026-13-01',
    '2026-02-30',
    '20260920',
    '',
  ])('opens the launch destination when the date reads %s', (date) => {
    const path = `orbit://habits/${HABIT_ID}?date=${date}`

    expect(redirectSystemPath({ path, initial: true })).toBe('/')
  })

  it.each([
    'orbit://habits/%20?date=2026-09-20',
    'orbit://habits/%ZZ?date=2026-09-20',
  ])('opens the launch destination when the habit id reads %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/')
  })

  it('leaves a habit link that carries no day alone', () => {
    const path = `/habits/${HABIT_ID}`

    expect(redirectSystemPath({ path, initial: false })).toBe(path)
  })
})
