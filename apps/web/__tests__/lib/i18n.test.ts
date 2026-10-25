import { expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { pluralMessageCases } from '@orbit/shared/test-support/plural-messages'

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('never returns ICU source for plural messages in $locale', ({ locale, messages }) => {
  const t = createTranslator({ locale, messages, onError: (error) => { throw error } })
  for (const { key, values } of pluralMessageCases(messages)) {
    for (const count of [0, 1, 2, 14, 100]) {
      expect(t(key as Parameters<typeof t>[0], values(count)), `${key}, count=${count}`).not.toMatch(/,\s*plural\s*,/)
    }
  }
})

it.each([
  { locale: 'en', messages: en, singular: '1 event', plural: '2 events', day: '1 trial day left', days: '14 trial days left' },
  { locale: 'pt-BR', messages: ptBR, singular: '1 evento', plural: '2 eventos', day: 'Falta 1 dia de teste', days: 'Faltam 14 dias de teste' },
])('formats the event and trial branches in $locale', ({ locale, messages, singular, plural, day, days }) => {
  const t = createTranslator({ locale, messages })
  expect(t('calendar.eventsFound', { count: 1 })).toBe(singular)
  expect(t('calendar.eventsFound', { count: 2 })).toBe(plural)
  expect(t('upgrade.convert.trialDaysLeft', { days: 1 })).toBe(day)
  expect(t('upgrade.convert.trialDaysLeft', { days: 14 })).toBe(days)
})
