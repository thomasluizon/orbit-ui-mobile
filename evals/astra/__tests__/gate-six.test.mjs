import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import { toolCall } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const scenario = (family, locale) => structuredClone(corpus.find((entry) => entry.metadata.family === family && entry.metadata.locale === locale))
const argumentsFrom = (value) => {
  if (Array.isArray(value)) return value.map(argumentsFrom)
  if (value && typeof value === 'object') return 'textContains' in value ? value.textContains
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, argumentsFrom(child)]))
  return value
}
function grade(test, calls) {
  return behavior({ trace: { state: 'available', requestId: 'request', responseRequestId: 'request',
    calls: calls.map(({ status, ...call }) => ({ ...call, resultStatus: status })) } },
  { vars: { ...test.vars, evalRequestId: 'request' } })
}
it.each(['en', 'pt-BR'])('keeps coalesced bulk creation within the requested scope in %s', (locale) => {
  for (const family of ['existing-parents', 'medical-batch']) {
    const test = scenario(family, locale)
    const supplied = argumentsFrom(test.vars.expectations.required[0].arguments)
    const call = () => toolCall('bulk_create_habits', supplied, 'PendingConfirmation')
    expect(grade(test, [call()]).pass).toBe(true)
    const wrong = structuredClone(supplied)
    if (family === 'existing-parents') wrong.habits[0].parent_habit_id = 'wrong-parent'
    else wrong.habits[0].due_date = 'wrong-date'
    expect(grade(test, [toolCall('bulk_create_habits', wrong, 'PendingConfirmation')]).pass).toBe(false)
    expect(grade(test, [call(), { ...call(), id: 'second', result: { ...call().result, id: 'second' } }]).pass).toBe(false)
    supplied.habits.push({ title: 'Unrequested habit' })
    expect(grade(test, [call()]).pass).toBe(false)
  }
})
it.each(['en', 'pt-BR'])('allows profile context while keeping outcome requirements in %s', (locale) => {
  for (const family of ['calendar-sync', 'feature-help']) {
    const test = scenario(family, locale)
    const required = test.vars.expectations.required[0]
    const target = toolCall(required.name, required.arguments ?? required.argumentsAnyOf[0], 'Succeeded', 'target')
    const profile = toolCall('get_profile', {}, 'Succeeded', 'profile')
    expect(grade(test, [profile, target]).pass).toBe(true)
    expect(grade(test, [profile]).pass).toBe(false)
    expect(grade(test, [profile, target, toolCall('delete_habit', { habit_id: 'other' }, 'PendingConfirmation', 'write')]).pass).toBe(false)
  }
})
it.each(['en', 'pt-BR'])('declares the medical correction setup dependency in %s', (locale) => {
  expect(scenario('medical-correction', locale).vars.setup.caseId).toBe(`composition-medical-batch-${locale}`)
})
it.each(['en', 'pt-BR'])('binds medical dates to the account year and the stated day in %s', (locale) => {
  const test = scenario('medical-batch', locale)
  expect(test.vars.expectations.required[0].arguments.habits[0].due_date).toBe('{accountYear}-10-26')
  expect(test.vars.rubric).toContain('{accountDate}')
  expect(test.vars.rubric).toContain('{accountYear}-10-26')
})

it.each(['calendar-sync', 'error', 'offline'])('asks about Google Agenda in the Portuguese %s case', (family) => {
  const test = scenario(family, 'pt-BR')
  expect(test.vars.input).toMatch(/agenda do Google|Google Agenda/u)
  expect(test.vars.input).not.toContain('meu calendário')
  expect(test.vars.expectations.required[0].name).toBe('get_calendar_overview')
})
