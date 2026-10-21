import { getNumberFormat } from './intl-format-cache'

export function formatPrice(unitAmount: number, currency: string): string {
  const amount = unitAmount / 100
  // WHY: Keep plan and charge notation tied to currency across UI locales. https://github.com/thomasluizon/orbit-tickets/issues/386
  const locale = currency === 'brl' ? 'pt-BR' : 'en-US'
  const currencyCode = currency.toUpperCase()

  return getNumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function monthlyEquivalent(yearlyUnitAmount: number): number {
  return Math.round(yearlyUnitAmount / 12)
}

export function applySubscriptionDiscount(
  unitAmount: number,
  couponPercentOff: number | null | undefined,
): number {
  if (!couponPercentOff) {
    return unitAmount
  }

  return Math.round(unitAmount * (1 - couponPercentOff / 100))
}
