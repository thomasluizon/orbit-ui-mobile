import { describe, expect, it } from 'vitest'
import { createAstraAllowanceTranslator } from '../utils/astra-allowance'

const translate = (key: string, values?: Record<string, string | number | Date>) => `${key}:${JSON.stringify(values ?? {})}`

describe('Astra allowance copy', () => {
  it.each([undefined, null, 'day'] as const)('retains daily wording for period %s', (aiMessagesPeriod) => {
    const copy = createAstraAllowanceTranslator(translate, { aiMessagesPeriod }, 'en')
    expect(copy('shell.composer.usage', { used: 2, limit: 5 })).toBe('shell.composer.usage:{"used":2,"limit":5}')
    expect(copy('shell.composer.limit.renewal')).toBe('shell.composer.limit.renewal:{}')
  })

  it.each([
    ['en', 'America/Sao_Paulo', '2026-11-09T02:00:00Z', 'Sunday'],
    ['en', 'Asia/Tokyo', '2026-11-08T15:00:00Z', 'Monday'],
    ['pt-BR', 'America/Sao_Paulo', '2026-11-09T02:00:00Z', 'domingo'],
    ['pt-BR', 'Europe/Lisbon', '2026-11-09T00:00:00Z', 'segunda-feira'],
  ])('uses the returned reset in %s and %s', (locale, timeZone, aiMessagesResetsAt, day) => {
    const copy = createAstraAllowanceTranslator(translate, { aiMessagesPeriod: 'week', aiMessagesResetsAt, timeZone }, locale)
    expect(copy('shell.composer.limit.renewal')).toBe(`shell.composer.limit.renewalWeekly:${JSON.stringify({ day })}`)
  })

  it('does not invent a reset when only the weekly period is present', () => {
    const copy = createAstraAllowanceTranslator(translate, { aiMessagesPeriod: 'week' }, 'en')
    expect(copy('shell.composer.limit.renewal')).toBe('shell.composer.limit.renewalWeeklyUnknown:{}')
    expect(copy('chat.dailyBudgetReached')).toBe('chat.dailyBudgetReached:{}')
    expect(copy('habits.form.dateBudgetReached')).toBe('habits.form.dateBudgetReached:{}')
  })

})
