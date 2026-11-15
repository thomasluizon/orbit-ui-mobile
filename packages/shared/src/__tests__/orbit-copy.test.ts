import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

type Messages = Record<string, unknown>

function flatten(messages: Messages, prefix = ''): Array<[string, string]> {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flatten(value as Messages, `${prefix}${key}.`),
  )
}

const englishValues = flatten(en as Messages)
const portugueseValues = flatten(ptBR as Messages)
const englishByKey = new Map(englishValues)
const portugueseByKey = new Map(portugueseValues)

/** Every allowance string with a plural count, in both locales. */
const PLURAL_ALLOWANCE_KEYS = [
  'shell.composer.limit.reason',
  'shell.composer.limit.reasonWeekly',
  'habits.form.localReadLimit',
  'habits.form.localReadLimitWeekly',
  'upgrade.billing.plan.proBody',
  'upgrade.billing.plan.proBodyWeekly',
  'upgrade.billing.lapsed.lostMessages',
]

const ALLOWANCE_KEYS = [
  'shell.composer.limit.exhausted',
  'shell.composer.limit.exhaustedWeekly',
  'shell.composer.limit.reason',
  'shell.composer.limit.reasonWeekly',
  'habits.form.aiSuggestLimitReached',
  'habits.form.aiSuggestLimitReachedWeekly',
  'habits.form.localReadLimit',
  'habits.form.localReadLimitWeekly',
  'chat.limitReachedError',
  'chat.limitReachedErrorWeekly',
  'chat.account.row.astraAllowance',
  'trial.expired.astraCeiling',
  'upgrade.outcomes.astra',
  'upgrade.billing.usage.title',
  'upgrade.billing.usage.nearLimit',
  'upgrade.billing.usage.nearLimitWeekly',
  'errors.api.astraLimit',
  'errors.api.astraLimitWeekly',
]

describe('Orbit copy', () => {
  it.each([['en', englishValues], ['pt-BR', portugueseValues]] as const)(
    'holds no second character name in %s',
    (_locale, values) => {
      for (const [key, value] of values) expect(value, key).not.toMatch(/astra/i)
    },
  )

  it.each(ALLOWANCE_KEYS)('names the limit as AI messages in both locales: %s', (key) => {
    const english = englishByKey.get(key) ?? ''
    const portuguese = portugueseByKey.get(key) ?? ''
    expect(english, key).toMatch(/AI message/)
    expect(portuguese, key).toMatch(/de IA/)
    for (const value of [english, portuguese]) {
      expect(value, key).not.toMatch(/Orbit message|mensagens do Orbit/)
    }
  })

  it.each([['en', englishValues], ['pt-BR', portugueseValues]] as const)(
    'never makes Orbit the subject of a failure in %s',
    (_locale, values) => {
      const failureSubject =
        /Orbit (couldn['’]t|could not|can['’]t|cannot|is unavailable|não conseguiu|não consegue|está indisponível)/i
      for (const [key, value] of values) expect(value, key).not.toMatch(failureSubject)
    },
  )

  it('speaks a failure of the AI in the first person', () => {
    expect(en.errors.api.aiUnavailable).toBe("I can't answer right now. Try again in a moment.")
    expect(ptBR.errors.api.aiUnavailable).toBe('Não consigo responder agora. Tente daqui a pouco.')
    expect(en.chat.operation.status.changeNotMade).toBe("I couldn't make that change.")
    expect(ptBR.chat.operation.status.changeNotMade).toBe('Não consegui fazer essa alteração.')
  })

  it('names the conversation entry as Talk to Orbit', () => {
    expect(en.shell.astraButton.open).toBe('Talk to Orbit')
    expect(ptBR.shell.astraButton.open).toBe('Falar com o Orbit')
  })

  it('names the proactive feature with one term in each locale, apart from the Avisos destination', () => {
    expect(en.trial.expired.proactiveAstra).toBe(en.profile.proactiveAstra.title)
    expect(ptBR.trial.expired.proactiveAstra).toBe(ptBR.profile.proactiveAstra.title)
    expect(ptBR.profile.proactiveAstra.title).not.toContain(ptBR.notifications.title)
  })

  it('gives Orbit its article where a Portuguese sentence names it', () => {
    expect(ptBR.chat.placement.recommendation).toMatch(/^O Orbit /)
  })

  it('names one unit in the free plan heading in both locales, in a word that stays whole at 2x text on a 320 phone', () => {
    expect(en.upgrade.convert.freeHeading).toMatch(/\breplies\b/)
    expect(ptBR.upgrade.convert.freeHeading).toMatch(/\brespostas\b/)
  })

  it('keeps Orbit masculine in Portuguese', () => {
    for (const [key, value] of portugueseValues) {
      expect(value, key).not.toMatch(/(?<![\p{L}])(?:a|à|da|pela|na) Orbit\b/iu)
    }
  })

  it.each(PLURAL_ALLOWANCE_KEYS)('formats the plural allowance string %s for one and for a larger count in both locales', async (key) => {
    const { IntlMessageFormat } = await import('intl-messageformat')
    const variable = key.startsWith('upgrade') ? 'limit' : 'allowance'
    for (const [locale, byKey] of [['en', englishByKey], ['pt-BR', portugueseByKey]] as const) {
      const message = byKey.get(key) ?? ''
      expect(message, `${locale} ${key}`).toMatch(/, plural, /)
      for (const count of [1, 5]) {
        const formatted = new IntlMessageFormat(message, locale).format({ [variable]: count }) as string
        expect(formatted, `${locale} ${key} ${count}`).toContain(String(count))
        expect(formatted, `${locale} ${key} ${count}`).not.toMatch(/[#{}]/)
        expect(formatted, `${locale} ${key} ${count}`).not.toMatch(count === 1 ? /\b1 (?:AI )?messages\b|\b1 mensagens\b/ : /\b5 (?:AI )?message\b|\b5 mensagem\b/)
      }
    }
  })
})
