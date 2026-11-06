import { createRequire } from 'node:module'
import { IntlMessageFormat } from 'intl-messageformat'
import { expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const QUESTION_KEYS = [
  'auth.email',
  'auth.verificationCode',
  'stepUp.codeLabel',
  'profile.editName.label',
  'profile.language.question',
  'profile.timezonePicker.question',
  'settings.weekStartDay.question',
  'settings.clock.question',
  'orbitMcp.keyName',
  'orbitMcp.expiresAtLabel',
  'profile.apiKeys.setExpiry',
  'profile.apiKeys.scopeLabel',
  'profile.support.subject',
  'profile.support.message',
  'profile.freshStart.confirmLabel',
  'chat.choice.freeText',
  'chat.recordList.filter',
  'chat.templates.searchQuestion',
  'chat.habitSuggestions.promptQuestion',
  'onboarding.flow.what.label',
  'onboarding.flow.when.direct',
  'onboarding.flow.when.scheduleMode',
  'onboarding.flow.when.frequencyUnitLabel',
  'onboarding.flow.when.daysLabel',
  'onboarding.flow.when.timeLabel',
  'shareCard.periodQuestion',
  'habits.search.question',
  'habits.moveParent.searchQuestion',
  'habits.moveParent.destinations',
] as const

/** The fields each screen shows together, so no two of them may ask the same question. */
const SCREEN_QUESTIONS = {
  signInEmail: ['auth.email'],
  signInCode: ['auth.verificationCode'],
  apiKeySheet: ['orbitMcp.keyName', 'profile.apiKeys.setExpiry', 'orbitMcp.expiresAtLabel', 'profile.apiKeys.scopeLabel'],
  support: ['profile.support.subject', 'profile.support.message'],
  freshStart: ['profile.freshStart.confirmLabel', 'profile.freshStart.confirmInstruction'],
  onboardingWhat: ['onboarding.flow.what.title', 'onboarding.flow.what.label'],
  onboardingWhen: ['onboarding.flow.when.direct', 'onboarding.flow.when.scheduleMode', 'onboarding.flow.when.frequencyUnitLabel', 'onboarding.flow.when.daysLabel', 'onboarding.flow.when.timeLabel'],
  moveParent: ['habits.moveParent.searchQuestion', 'habits.moveParent.destinations'],
  choiceBlock: ['chat.choice.freeText'],
} as const

/** ListRow titles this work introduced; `local/max-button-words` cannot read them through a variable. */
const ROW_LABEL_KEYS = ['profile.apiKeys.setExpiry'] as const

const { wordCount } = createRequire(import.meta.url)('../../../../eslint-rules/_control-labels.cjs') as { wordCount: (label: string) => number | null }

const RETIRED_KEYS = ['profile.language.description', 'settings.weekStartDay.title'] as const

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], messages)
}

it.each(QUESTION_KEYS.flatMap((key) => [{ key, locale: 'en', messages: en }, { key, locale: 'pt-BR', messages: ptBR }]))('asks $key as a question in $locale', ({ key, messages }) => {
  const label = lookup(messages, key)
  expect(typeof label).toBe('string')
  expect(label as string).toMatch(/\?/)
})

it.each(RETIRED_KEYS)('retires the system label %s that the question replaced', (key) => {
  expect(lookup(en, key)).toBeUndefined()
  expect(lookup(ptBR, key)).toBeUndefined()
})

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('asks the fresh start confirmation as one question and keeps ORBIT in the hint in $locale', ({ messages }) => {
  const label = lookup(messages, 'profile.freshStart.confirmLabel') as string
  const hint = lookup(messages, 'profile.freshStart.confirmInstruction') as string
  expect(label).toMatch(/^[^.?!]+\?$/)
  expect(label).not.toContain('ORBIT')
  expect(hint).toContain('ORBIT')
  expect(hint).not.toMatch(/\?/)
})

it.each(Object.entries(SCREEN_QUESTIONS).flatMap(([screen, keys]) => [{ screen, keys, locale: 'en', messages: en }, { screen, keys, locale: 'pt-BR', messages: ptBR }]))('never asks the same question twice on $screen in $locale', ({ keys, messages }) => {
  const questions = keys.map((key) => (lookup(messages, key) as string).trim().toLocaleLowerCase())
  expect(questions.every(Boolean)).toBe(true)
  expect(new Set(questions).size).toBe(questions.length)
})

it.each(ROW_LABEL_KEYS.flatMap((key) => [{ key, locale: 'en', messages: en }, { key, locale: 'pt-BR', messages: ptBR }]))('keeps the row question $key within two words in $locale', ({ key, messages }) => {
  const count = wordCount(lookup(messages, key) as string)
  expect(count).not.toBeNull()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(2)
})

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('names the Astra record filter icon by its action, apart from the field question, in $locale', ({ messages }) => {
  const action = lookup(messages, 'chat.recordList.filterAction')
  expect(typeof action).toBe('string')
  expect(action as string).not.toMatch(/\?/)
  expect(action).not.toBe(lookup(messages, 'chat.recordList.filter'))
})

it('asks the pt-BR API key expiry as what the key should do', () => {
  expect(lookup(ptBR, 'orbitMcp.expiresAtLabel')).toBe('Quando ela deve expirar? (UTC)')
})

it.each([0, 1, 3])('asks the pt-BR move destination for %i habits without a gendered pronoun', (count) => {
  const question = new IntlMessageFormat(lookup(ptBR, 'habits.moveParent.destinations') as string, 'pt-BR').format({ count }) as string
  expect(question).toBe(count === 1 ? 'Para onde vai?' : 'Para onde vão?')
  expect(question).not.toMatch(/\b(ele|eles|ela|elas)\b/i)
})
