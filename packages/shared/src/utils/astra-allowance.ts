import type { Profile } from '../types/profile'
import { formatLocaleDate } from './locale-format'

export type AstraAllowance = Pick<Profile, 'aiMessagesPeriod' | 'aiMessagesResetsAt'> & { timeZone?: string | null }
type AllowanceValues = Record<string, string | number | Date>
type AllowanceTranslator = (key: string, values?: AllowanceValues) => string

const PERIOD_KEYS = new Set([
  'shell.composer.usage',
  'shell.composer.limit.renewal',
  'shell.composer.limit.exhausted',
  'shell.composer.limit.placeholder',
  'shell.composer.limit.reason',
  'habits.form.aiSuggestLimitReached',
  'habits.form.askAstraCost',
  'habits.form.localReadLimit',
  'chat.choice.limit',
  'chat.limitReachedError',
  'chat.messagesUsed',
  'profile.allowance.title',
  'profile.allowance.spent',
  'onboarding.flow.when.limit',
  'upgrade.billing.plan.proBody',
  'upgrade.billing.usage.aiMessages',
  'upgrade.billing.usage.nearLimit',
  'upgrade.billing.lapsed.lostMessages',
  'errors.api.astraLimit',
])

export function createAstraAllowanceTranslator(
  translate: AllowanceTranslator,
  allowance: AstraAllowance | null | undefined,
  locale: string,
): AllowanceTranslator {
  return (key, values) => {
    if (allowance?.aiMessagesPeriod !== 'week' || !PERIOD_KEYS.has(key)) return translate(key, values)
    if (key !== 'shell.composer.limit.renewal') return translate(`${key}Weekly`, values)
    if (!allowance.aiMessagesResetsAt) return translate('shell.composer.limit.renewalWeeklyUnknown')
    const day = formatLocaleDate(allowance.aiMessagesResetsAt, locale, {
      weekday: 'long', timeZone: allowance.timeZone ?? 'UTC',
    })
    return translate('shell.composer.limit.renewalWeekly', { ...values, day })
  }
}
