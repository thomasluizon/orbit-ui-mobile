import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { outcome } from '../client-path.mjs'
import { readCorpus } from '../grade-method.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import { createPreview } from './fixtures/producer.mjs'

const corpus = readCorpus()
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-eight.json', import.meta.url), 'utf8'))
const accountDate = '2026-10-23'
function scenario(id) {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === id))
  test.vars = { ...JSON.parse(JSON.stringify(test.vars).replace(/\{accountDate([+]\d+)\}/g,
    (_, offset) => dateOffset(accountDate, Number(offset)))), accountDate }
  return test
}
const recordedHabits = (id) => structuredClone(recorded.find(({ caseId }) => caseId === id).toolCalls[0].arguments.habits)
// The outcome of one case for the preview that the server builds from the habits of a recorded create.
const grade = (test, habits) => outcome({ turns: 1, questionsBeforePreview: 0, previews: [createPreview(habits)], asked: false, written: [] },
  { vars: test.vars })

it.each(['en', 'pt-BR'])('accepts the avoid habit only with its recurring cadence in %s', (locale) => {
  const test = scenario(`composition-avoid-form-${locale}`)
  const habits = recordedHabits(test.metadata.id)
  expect(grade(test, habits).pass).toBe(false)
  Object.assign(habits[0], { frequency_unit: 'Day', frequency_quantity: 1, is_general: false })
  expect(grade(test, habits)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  expect(grade(test, [{ ...habits[0], is_bad_habit: false }]).pass).toBe(false)
  habits.push(structuredClone(habits[0]))
  expect(grade(test, habits).reason).toMatch(/^The preview holds a change outside the request\./u)
})

it.each(['en', 'pt-BR'])('fails an avoid habit that is general or repeats less than daily in %s', (locale) => {
  const test = scenario(`composition-avoid-form-${locale}`)
  const [recordedHabit] = recordedHabits(test.metadata.id)
  const avoid = { ...recordedHabit, frequency_unit: 'Day', frequency_quantity: null, is_general: null }
  expect(grade(test, [avoid])).toMatchObject({ pass: true })
  expect(grade(test, [{ ...avoid, frequency_quantity: 1, is_general: false }]).pass).toBe(true)
  expect(grade(test, [{ ...avoid, is_general: true }]).pass).toBe(false)
  expect(grade(test, [{ ...avoid, frequency_quantity: 3 }]).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('preserves medical title wording without admitting wrong dates or cadence in %s', (locale) => {
  const test = scenario(`composition-medical-batch-${locale}`)
  const habits = recordedHabits(test.metadata.id)
  expect(grade(test, habits).pass).toBe(false)
  Object.assign(habits[2], { title: locale === 'en' ? 'Stop multivitamins' : 'Parar com multivitamínico',
    frequency_unit: 'Day', due_date: '2026-10-27', end_date: '2026-10-30' })
  Object.assign(habits[3], { frequency_unit: 'Day', due_date: '2026-10-29', end_date: '2026-10-30' })
  expect(grade(test, habits)).toMatchObject({ pass: true })
  for (const wrong of ['title', 'date', 'cadence', 'time']) {
    const changed = structuredClone(habits)
    if (wrong === 'title') changed[2].title = locale === 'en' ? 'Take multivitamins' : 'Tomar multivitamínico'
    if (wrong === 'date') changed[2].due_date = '2026-10-29'
    if (wrong === 'cadence') changed[2].frequency_unit = 'OneTime'
    if (wrong === 'time') changed[0].due_time = '16:50'
    expect(grade(test, changed).pass).toBe(false)
  }
})
