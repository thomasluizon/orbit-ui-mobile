import { describe, expect, it } from 'vitest'
import {
  applySubscriptionDiscount,
  formatPrice,
  monthlyEquivalent,
} from '../utils/subscription-pricing'

describe('formatPrice', () => {
  it('renders a USD amount from cents with two fraction digits', () => {
    expect(formatPrice(999, 'usd')).toBe('$9.99')
  })

  it('renders a zero amount as a fully formatted price', () => {
    expect(formatPrice(0, 'usd')).toBe('$0.00')
  })

  it('keeps the leading zero on sub-dollar amounts', () => {
    expect(formatPrice(1, 'usd')).toBe('$0.01')
  })

  it('groups thousands for large USD amounts', () => {
    expect(formatPrice(100000, 'usd')).toBe('$1,000.00')
  })

  it('formats BRL with the pt-BR decimal comma', () => {
    const formatted = formatPrice(4990, 'brl')
    expect(formatted).toContain('R$')
    expect(formatted).toContain('49,90')
  })

  it('groups thousands for BRL with a dot and comma decimal', () => {
    expect(formatPrice(100000, 'brl')).toContain('1.000,00')
  })
})

describe('monthlyEquivalent', () => {
  it('divides a yearly amount into a rounded monthly figure', () => {
    expect(monthlyEquivalent(7999)).toBe(667)
  })

  it('returns an exact division without rounding artifacts', () => {
    expect(monthlyEquivalent(12000)).toBe(1000)
  })

  it('returns zero for a zero yearly amount', () => {
    expect(monthlyEquivalent(0)).toBe(0)
  })

  it('rounds to the nearest cent across the half-cent boundary', () => {
    expect(monthlyEquivalent(65)).toBe(5)
    expect(monthlyEquivalent(66)).toBe(6)
  })
})

describe('applySubscriptionDiscount', () => {
  it('applies a whole-percent discount', () => {
    expect(applySubscriptionDiscount(1000, 20)).toBe(800)
  })

  it('returns the full amount when no coupon is present', () => {
    expect(applySubscriptionDiscount(1000, null)).toBe(1000)
    expect(applySubscriptionDiscount(1000, undefined)).toBe(1000)
  })

  it('treats a zero-percent coupon as no discount', () => {
    expect(applySubscriptionDiscount(1000, 0)).toBe(1000)
  })

  it('reduces the amount to zero for a full 100 percent discount', () => {
    expect(applySubscriptionDiscount(1000, 100)).toBe(0)
  })

  it('rounds a half-cent discount up to the nearest cent', () => {
    expect(applySubscriptionDiscount(999, 50)).toBe(500)
  })

  it('supports fractional-percent coupons', () => {
    expect(applySubscriptionDiscount(1000, 33.33)).toBe(667)
  })
})
