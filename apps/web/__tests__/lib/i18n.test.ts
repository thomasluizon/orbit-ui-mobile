import { expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { countedMessageExamples, pluralMessageCases } from '@orbit/shared/test-support/plural-messages'
import { formatCatalogMessage } from '../../e2e/support/messages'

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const)('never returns ICU source for plural messages in $locale', ({ locale, messages }) => {
  const t = createTranslator({ locale, messages, onError: (error) => { throw error } })
  for (const { key, values } of pluralMessageCases(messages)) {
    for (const count of [0, 1, 2, 14, 100]) {
      const formatted = t(key as Parameters<typeof t>[0], values(count))
      expect(formatted, `${key}, count=${count}`).not.toMatch(/,\s*plural\s*,/)
      expect(formatCatalogMessage(locale, key, values(count)), `${key}, count=${count}`).toBe(formatted)
    }
  }
})

it.each([
  { locale: 'en', lapsed: 'Astra messages went back to 5 a day.', exhausted: "Today's allowance of 15 Astra messages is used.", five: "Today's allowance of 5 Astra messages is used.", events: 'View all (4)' },
  { locale: 'pt-BR', lapsed: 'A cota da Astra voltou para 5 mensagens por dia.', exhausted: 'Você usou as 15 mensagens de hoje com a Astra.', five: 'Você usou as 5 mensagens de hoje com a Astra.', events: 'Ver todos (4)' },
] as const)('formats the hermetic layout expectations in $locale', ({ locale, lapsed, exhausted, five, events }) => {
  expect(formatCatalogMessage(locale, 'upgrade.billing.lapsed.lostMessages', { limit: 5 })).toBe(lapsed)
  expect(formatCatalogMessage(locale, 'shell.composer.limit.reason', { allowance: 15 })).toBe(exhausted)
  expect(formatCatalogMessage(locale, 'shell.composer.limit.reason', { allowance: 5 })).toBe(five)
  expect(formatCatalogMessage(locale, 'calendar.dayDetail.viewAllEvents', { count: 4 })).toBe(events)
})

it('rejects a layout expectation without the required plural argument', () => {
  expect(() => formatCatalogMessage('en', 'calendar.dayDetail.viewAllEvents')).toThrow()
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


it.each(countedMessageExamples)('inflects queued changes, items and elapsed days in $locale', ({ locale, queued, syncing, items, days }) => {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR, onError: (error) => { throw error } })
  for (const count of [0, 1, 2]) {
    expect(t('common.queued', { count })).toBe(queued[count])
    expect(t('common.syncing', { count })).toBe(syncing[count])
    expect(t('chat.recordList.templateCount', { count })).toBe(items[count])
    expect(t('celebration.streak.line', { count })).toBe(days[count])
  }
})
