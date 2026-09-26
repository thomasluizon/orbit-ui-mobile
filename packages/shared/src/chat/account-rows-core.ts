import type { AccountRowsCard } from '../types/chat'

type AccountRow = AccountRowsCard['rows'][number]

const LABELS = {
  name: 'chat.account.row.name', email: 'chat.account.row.email', language: 'chat.account.row.language',
  timeZone: 'chat.account.row.timeZone', weekStartDay: 'chat.account.row.weekStartDay',
  themePreference: 'chat.account.row.themePreference', aiSummary: 'chat.account.row.aiSummary',
  plan: 'chat.account.row.plan', trialEnd: 'chat.account.row.trialEnd',
  planExpiry: 'chat.account.row.planExpiry', interval: 'chat.account.row.interval',
  source: 'chat.account.row.source', lifetime: 'chat.account.row.lifetime',
  astraAllowance: 'chat.account.row.astraAllowance',
  successfulReferrals: 'chat.account.row.successfulReferrals',
  pendingReferrals: 'chat.account.row.pendingReferrals', maxReferrals: 'chat.account.row.maxReferrals',
  rewardType: 'chat.account.row.rewardType', discountPercent: 'chat.account.row.discountPercent',
} as const

const ENUM_VALUES: Partial<Record<keyof typeof LABELS, readonly string[]>> = {
  language: ['en', 'pt-BR'], weekStartDay: ['0', '1'], themePreference: ['dark', 'light'],
  plan: ['Free', 'Pro'], interval: ['monthly', 'yearly'], source: ['stripe', 'play'],
  rewardType: ['discount'],
}

export function accountRowLabelKey(key: string): string | null {
  return Object.hasOwn(LABELS, key) ? LABELS[key as keyof typeof LABELS] : null
}

export function formatAccountRowValue(row: AccountRow, locale: string, translate: (key: string) => string): string {
  const value = row.value
  if (value == null || value === '') return translate('chat.account.notSet')
  if (row.valueType === 'date') return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
  if (row.valueType === 'boolean') return translate(value === 'true' ? 'chat.account.yes' : 'chat.account.no')
  if (row.valueType === 'enum') {
    const values = ENUM_VALUES[row.key as keyof typeof LABELS]
    return values?.includes(value) ? translate(`chat.account.value.${row.key}.${value}`) : translate('chat.account.unknown')
  }
  if (row.valueType === 'count') {
    if (row.key === 'discountPercent') return new Intl.NumberFormat(locale, { style: 'percent' }).format(Number(value) / 100)
    return value.split('/').map((part) => new Intl.NumberFormat(locale).format(Number(part))).join(' / ')
  }
  return value
}
