import { expect, it } from 'vitest'
import { outcome } from '../client-path.mjs'
import { readCorpus } from '../grade-method.mjs'
import { createPreview } from './fixtures/producer.mjs'

const corpus = readCorpus()
const scenario = (family, locale) => structuredClone(corpus.find((entry) => entry.metadata.family === family && entry.metadata.locale === locale))
const records = { first: '11111111-aaaa-4aaa-8aaa-111111111111', second: '22222222-bbbb-4bbb-8bbb-222222222222' }
const fixtureEvidence = { habits: [{ id: records.first, title: 'Post Lunch' }, { id: records.second, title: 'Before Bed' }] }
// One value that an expected field accepts: its first word list entry, its clock time, the id of its record, or its text.
const accepted = (value) => value.contains?.[0] ?? value.time ?? records[value.record] ?? value
const habitsFrom = (test) => test.vars.outcome.changes.map((change) =>
  Object.fromEntries(Object.entries(change.fields).map(([field, value]) => [field, accepted(value)])))
const grade = (test, habits) => outcome({ turns: 1, questionsBeforePreview: 0, previews: [createPreview(habits)], asked: false, written: [] },
  { vars: { ...test.vars, accountDate: '2026-10-23', records, fixtureEvidence } })

it.each(['en', 'pt-BR'])('keeps a batch of new records within the requested scope in %s', (locale) => {
  for (const family of ['existing-parents', 'medical-batch']) {
    const test = scenario(family, locale)
    const habits = habitsFrom(test)
    expect(grade(test, habits)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
    const wrong = structuredClone(habits)
    if (family === 'existing-parents') wrong[0].parent_habit_id = records.second
    else wrong[0].due_date = 'wrong-date'
    expect(grade(test, wrong).pass).toBe(false)
    expect(grade(test, [...habits, { title: 'Unrequested habit' }]).reason).toMatch(/^The preview holds a change outside the request\./u)
    expect(grade(test, habits.slice(1)).pass).toBe(false)
  }
})
it('accepts the stored title of a parent in place of its id', () => {
  const test = scenario('existing-parents', 'en')
  const habits = habitsFrom(test)
  habits[0].parent_habit_id = 'Post Lunch'
  habits[1].parent_habit_id = 'Before Bed'
  expect(grade(test, habits)).toMatchObject({ pass: true })
})
it.each(['en', 'pt-BR'])('declares the medical correction setup dependency in %s', (locale) => {
  expect(scenario('medical-correction', locale).vars.setup.caseId).toBe(`composition-medical-batch-${locale}`)
})
it.each(['en', 'pt-BR'])('binds medical dates to future account date offsets in %s', (locale) => {
  const test = scenario('medical-batch', locale)
  expect(test.vars.outcome.changes.map((change) => change.fields.due_date))
    .toEqual(['{accountDate+3}', '{accountDate+7}', '{accountDate+4}', '{accountDate+6}', '{accountDate+7}'])
})

it.each(['calendar-sync', 'error', 'offline'])('asks about Google Agenda in the Portuguese %s case', (family) => {
  const test = scenario(family, 'pt-BR')
  expect(test.vars.input).toMatch(/agenda do Google|Google Agenda/u)
  expect(test.vars.input).not.toContain('meu calendário')
  expect(test.vars.outcome).toEqual({ read: true })
})

it.each(['en', 'pt-BR'])('requests the seeded month dates and saved narrative in %s', (locale) => {
  const test = scenario('stale', locale)
  expect(test.vars.input).toContain('{retrospectiveFrom}')
  expect(test.vars.input).toContain('{accountDate}')
  expect(test.vars.composition.blocks).toEqual([{ kind: 'periodInsight', completeness: 'stale', recovery: 'refresh' }])
})
