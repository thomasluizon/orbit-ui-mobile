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
    expect(english, key).toMatch(/AI message|AI limit/)
    expect(portuguese, key).toMatch(/de IA/)
    for (const value of [english, portuguese]) {
      expect(value, key).not.toMatch(/Orbit message|mensagens do Orbit/)
    }
  })

  it.each([['en', englishValues], ['pt-BR', portugueseValues]] as const)(
    'never makes Orbit the subject of a failure in %s',
    (_locale, values) => {
      const failureSubject =
        /Orbit (couldn't|could not|can't|cannot|is unavailable|não conseguiu|não consegue|está indisponível)/
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

  it('keeps Orbit masculine in Portuguese', () => {
    for (const [key, value] of portugueseValues) {
      expect(value, key).not.toMatch(/(?<![\p{L}])(?:a|à|da|pela|na) Orbit\b/u)
    }
  })

  it('formats the plural allowance strings for one and for a larger count', async () => {
    const { IntlMessageFormat } = await import('intl-messageformat')
    for (const key of ['shell.composer.limit.reason', 'habits.form.localReadLimit', 'upgrade.billing.plan.proBody']) {
      const variable = key.startsWith('upgrade') ? 'limit' : 'allowance'
      for (const [locale, byKey] of [['en', englishByKey], ['pt-BR', portugueseByKey]] as const) {
        const message = byKey.get(key) ?? ''
        for (const count of [1, 5]) {
          const formatted = new IntlMessageFormat(message, locale).format({ [variable]: count }) as string
          expect(formatted, `${locale} ${key} ${count}`).not.toContain('#')
          expect(formatted.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
