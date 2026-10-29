import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { toolCall, chatResponse, deferredCreationCall } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-nine.json', import.meta.url), 'utf8'))
const scenario = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id))
const callsFor = (entry) => entry.toolCalls.map((call, index) => toolCall(call.name, call.arguments, call.resultStatus, `call-${index}`))
const grade = (test, calls) => behavior(parseResponse(chatResponse('request', calls), '',
  { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } }),
{ vars: { ...test.vars, evalRequestId: 'request' } })

// Producer: ResolvedWithoutWrite rejects these arguments before dispatch.
const rejectedBeforeDispatch = (call) => {
  call.result.error = 'Name an avoid habit for the behaviour itself; use a positive commitment for an abstention.'
  call.result.payload = { status: 'no_new_preview', unresolved_names: [], ambiguous_names: {},
    existing_duplicates: [], pending_duplicates: [],
    instruction: "These arguments were rejected before dispatch and produced no preview. Correct the validation error using the person's request, preserve all other requested actions and fields, then call the write tool again. Do not claim anything was saved." }
}

it('grades the held outcome after a validation rejection without admitting failed or extra writes', () => {
  const entry = recorded.find(({ caseId }) => caseId === 'composition-avoid-form-en')
  const test = scenario(entry.caseId)
  const calls = callsFor(entry)
  rejectedBeforeDispatch(calls[0])
  expect(grade(test, calls).pass).toBe(true)
  expect(grade(test, [calls[0]]).pass).toBe(false)
  for (const mutate of [
    (changed) => { changed[0].result.payload = null },
    (changed) => { changed[0].result.payload.status = 'unknown' },
    (changed) => { changed[0].status = 'Succeeded'; changed[0].result.success = true },
    (changed) => { changed[1].arguments.habits[0].title = 'Unrequested' },
    (changed) => { changed.push({ ...structuredClone(changed[1]), id: 'extra', result: { ...changed[1].result, id: 'extra' } }) },
  ]) {
    const changed = structuredClone(calls)
    mutate(changed)
    expect(grade(test, changed).pass).toBe(false)
  }
  expect(grade(test, [...calls].reverse()).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('accepts existing heading wrappers with explicit child parents in %s', (locale) => {
  const entry = recorded.find(({ caseId }) => caseId === 'composition-existing-parents-pt-BR')
  const test = scenario(`composition-existing-parents-${locale}`)
  const calls = callsFor(entry)
  // Persisted reports redact IDs; bind only the two known fixture destinations.
  calls[0].arguments.habits.forEach((parent, index) => {
    parent.sub_habits[0].parent_habit_id = index ? '{secondHabitId}' : '{habitId}'
    if (locale === 'en') {
      parent.title = index ? 'Before Bed' : 'Post Lunch'
      parent.sub_habits[0].title = index ? 'Take rosuvastatin' : 'Take vitamin D'
    }
  })
  expect(grade(test, calls).pass).toBe(true)
  for (const mutate of [
    (parents) => { parents[0].sub_habits[0].parent_habit_id = 'wrong-parent' },
    (parents) => { parents[0].sub_habits[0].parent_habit_id = null },
    (parents) => { parents[0].habit_id = 'wrong-parent' },
    (parents) => { parents[0].title = 'Unknown heading' },
    (parents) => { parents[0].due_time = '17:00' },
    (parents) => { parents[0].sub_habits[0].title = 'Unrequested child' },
  ]) {
    const changed = structuredClone(calls)
    mutate(changed[0].arguments.habits)
    expect(grade(test, changed).pass).toBe(false)
  }
})

it.each(recorded.filter(({ caseId }) => caseId.includes('medical-batch')))(
  'preserves the medical outcome for $caseId repeat $repeat', (entry) => {
    const test = scenario(entry.caseId)
    test.vars = JSON.parse(JSON.stringify(test.vars).replaceAll('{accountYear}', '2026'))
    const calls = callsFor(entry)
    expect(grade(test, calls).pass).toBe(entry.repeat === 2 && entry.caseId.endsWith('-en'))
    calls[0].arguments.habits[0].due_date = '2026-10-27'
    expect(grade(test, calls).pass).toBe(false)
  },
)

it('does not count a creation deferred for reads as a mutation or a second preview', () => {
  const entry = recorded.find(({ caseId }) => caseId === 'brain-dump-ideas-pt-BR')
  const test = scenario(entry.caseId)
  const calls = callsFor(entry)
  calls[0].result = deferredCreationCall(calls[0].arguments).result
  calls[0].result.id = calls[0].id
  expect(grade(test, calls).pass).toBe(true)
  for (const mutate of [
    (changed) => { changed.pop() },
    (changed) => { changed[0].result.payload.status = 'unknown' },
    (changed) => { changed[0].result.payload = null },
    (changed) => { changed[0].result.success = false },
  ]) {
    const changed = structuredClone(calls)
    mutate(changed)
    expect(grade(test, changed).pass).toBe(false)
  }
})
