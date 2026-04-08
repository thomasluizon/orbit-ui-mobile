export function formatPrice(unitAmount: number, currency: string): string {
  const amount = unitAmount / 100
  const locale = currency === 'brl' ? 'pt-BR' : 'en-US'
  const currencyCode = currency.toUpperCase()

  return new Intl.NumberFormat(locale, {
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
