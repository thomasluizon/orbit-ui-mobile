import { describe, expect, it } from 'vitest'
import {
  PLAY_BASE_PLAN_MONTHLY,
  PLAY_BASE_PLAN_YEARLY,
  PLAY_SUBSCRIPTION_PRODUCT_ID,
  playBasePlanToInterval,
} from '../utils/play-billing'

describe('play-billing constants', () => {
  it('exposes the Play product and base-plan ids configured in the Play Console', () => {
    expect(PLAY_SUBSCRIPTION_PRODUCT_ID).toBe('orbit_pro')
    expect(PLAY_BASE_PLAN_MONTHLY).toBe('monthly')
    expect(PLAY_BASE_PLAN_YEARLY).toBe('yearly')
  })
})

describe('playBasePlanToInterval', () => {
  it('maps the monthly base plan to the monthly interval', () => {
    expect(playBasePlanToInterval(PLAY_BASE_PLAN_MONTHLY)).toBe('monthly')
  })

  it('maps the yearly base plan to the yearly interval', () => {
    expect(playBasePlanToInterval(PLAY_BASE_PLAN_YEARLY)).toBe('yearly')
  })

  it('returns null for an unrecognized base plan', () => {
    expect(playBasePlanToInterval('weekly')).toBeNull()
  })
})
