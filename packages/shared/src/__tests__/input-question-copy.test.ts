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
] as const

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
