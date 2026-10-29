import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import { toolCall, chatResponse } from './fixtures/producer.mjs'
import parseResponse from '../response.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-eight.json', import.meta.url), 'utf8'))
const scenario = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id))
const outputFor = (calls) => parseResponse(chatResponse('request', calls), '',
  { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
const grade = (test, calls) => behavior(outputFor(calls), { vars: { ...test.vars, evalRequestId: 'request' } })

it.each(['en', 'pt-BR'])('allows the coaching tool and preserves its recorded outcome in %s', (locale) => {
  const test = scenario(`composition-coaching-advice-${locale}`)
  const recordedCall = recorded.find(({ caseId }) => caseId === test.metadata.id).toolCalls[0]
  const call = toolCall(recordedCall.name, recordedCall.arguments, recordedCall.resultStatus)
  const verdict = grade(test, [call])
  expect(verdict.pass).toBe(recordedCall.resultStatus === 'Succeeded')
  expect(verdict.reason).not.toContain('outside the allowed set')
  if (recordedCall.resultStatus === 'Failed') expect(verdict.reason).toContain('expected outcome')
  call.arguments.one_small_step = false
  expect(grade(test, [call]).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('accepts inherited owned parent IDs but rejects a different parent in %s', (locale) => {
  const test = scenario(`composition-existing-parents-${locale}`)
  const args = structuredClone(recorded.find(({ caseId }) => caseId === 'composition-existing-parents-pt-BR').toolCalls.at(-1).arguments)
  args.habits.forEach((parent, index) => {
    parent.habit_id = index ? '{secondHabitId}' : '{habitId}'
    if (locale === 'en') {
      parent.title = index ? 'Before Bed' : 'Post Lunch'
      parent.sub_habits[0].title = index ? 'Take rosuvastatin' : 'Take vitamin D'
    }
  })
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(true)
  args.habits[0].sub_habits[0].parent_habit_id = 'different-parent'
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('accepts either avoid creation tool while retaining the recurring cadence in %s', (locale) => {
  const test = scenario(`composition-avoid-form-${locale}`)
  const args = structuredClone(recorded.find(({ caseId }) => caseId === test.metadata.id).toolCalls[0].arguments)
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(false)
  Object.assign(args.habits[0], { frequency_unit: 'Day', frequency_quantity: 1, is_general: false })
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(true)
  expect(grade(test, [toolCall('create_habit', args.habits[0], 'PendingConfirmation')]).pass).toBe(true)
  args.habits.push(structuredClone(args.habits[0]))
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('preserves medical title wording without admitting wrong dates or cadence in %s', (locale) => {
  const test = scenario(`composition-medical-batch-${locale}`)
  test.vars = JSON.parse(JSON.stringify(test.vars).replace(/\{accountDate([+]\d+)\}/g,
    (_, offset) => dateOffset('2026-10-23', Number(offset))))
  const args = structuredClone(recorded.find(({ caseId }) => caseId === test.metadata.id).toolCalls[0].arguments)
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(false)
  Object.assign(args.habits[2], { title: locale === 'en' ? 'Stop multivitamins' : 'Parar com multivitamínico',
    frequency_unit: 'Day', due_date: '2026-10-27', end_date: '2026-10-30' })
  Object.assign(args.habits[3], { frequency_unit: 'Day', due_date: '2026-10-29', end_date: '2026-10-30' })
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(true)
  expect(test.vars.rubric).toContain("Preserve the person's own wording")
  for (const wrong of ['title', 'date', 'cadence', 'time']) {
    const changed = structuredClone(args)
    if (wrong === 'title') changed.habits[2].title = locale === 'en' ? 'Take multivitamins' : 'Tomar multivitamínico'
    if (wrong === 'date') changed.habits[2].due_date = '2026-10-29'
    if (wrong === 'cadence') changed.habits[2].frequency_unit = 'OneTime'
    if (wrong === 'time') changed.habits[0].due_time = '16:50'
    expect(grade(test, [toolCall('bulk_create_habits', changed, 'PendingConfirmation')]).pass).toBe(false)
  }
})
