import { formatLocaleDate } from '@orbit/shared/utils'

export const cardSurface: React.CSSProperties = {
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

export const cardLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-3)',
}

export const metaTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-3)',
}

export const whitePillLinkClassName =
  'inline-flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full bg-[var(--fg-1)] px-[26px] py-[14px] text-[16px] font-medium text-[var(--bg)] transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:opacity-90 active:translate-y-0 active:scale-[0.98]'

export function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

export function invoiceStatusColor(status: string): string {
  if (status === 'paid') return 'var(--status-done)'
  if (status === 'open') return 'var(--status-overdue)'
  return 'var(--fg-3)'
}

export function formatBillingDate(isoDate: string, locale: string): string {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
