import { describe, expect, it } from 'vitest'
import {
  applySubscriptionDiscount,
  formatPrice,
  monthlyEquivalent,
} from '../utils/subscription-pricing'

describe('subscription-pricing utils', () => {
  it('formats USD prices', () => {
    expect(formatPrice(999, 'usd')).toBe('$9.99')
  })

  it('formats BRL prices', () => {
    expect(formatPrice(4990, 'brl')).toContain('49')
  })

  it('computes the monthly equivalent from yearly pricing', () => {
    expect(monthlyEquivalent(7999)).toBe(667)
  })

  it('applies percentage discounts', () => {
    expect(applySubscriptionDiscount(1000, 20)).toBe(800)
  })

  it('returns the original amount without a discount', () => {
    expect(applySubscriptionDiscount(1000, null)).toBe(1000)
  })
})
