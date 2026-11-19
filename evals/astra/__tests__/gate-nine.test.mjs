import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { toolCall, chatResponse, createPreview, deferredCreationCall } from './fixtures/producer.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import { outcome } from '../client-path.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-nine.json', import.meta.url), 'utf8'))
const scenario = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id))
const callsFor = (entry) => entry.toolCalls.map((call, index) => toolCall(call.name, call.arguments, call.resultStatus, `call-${index}`))
const grade = (test, calls) => behavior(parseResponse(chatResponse('request', calls), '',
  { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } }),
{ vars: { ...test.vars, evalRequestId: 'request' } })

// The outcome of one case for the preview that the server builds from the habits of a recorded create.
const outcomeOf = (test, habits) => outcome({ turns: 1, questionsBeforePreview: 0, previews: [createPreview(habits)], asked: false, written: [] },
  { vars: { ...test.vars, accountDate: '2026-10-23' } })

// The recorded turn held one create after the server rejected the first arguments. A rejected write holds no preview,
// so the outcome is the held create alone.
it('grades the held create after a validation rejection', () => {
  const entry = recorded.find(({ caseId }) => caseId === 'composition-avoid-form-en')
  const test = scenario(entry.caseId)
  expect(entry.toolCalls.map((call) => call.resultStatus)).toEqual(['Failed', 'PendingConfirmation'])
  const { habits } = entry.toolCalls[1].arguments
  expect(outcomeOf(test, habits)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  expect(outcomeOf(test, [{ ...habits[0], title: 'Unrequested' }]).pass).toBe(false)
  expect(outcomeOf(test, [...habits, structuredClone(habits[0])]).reason).toMatch(/^The preview holds a change outside the request\./u)
})

it.each(recorded.filter(({ caseId }) => caseId.includes('medical-batch')))(
  'preserves the medical outcome for $caseId repeat $repeat', (entry) => {
    const test = scenario(entry.caseId)
    // Keep the recorded calls on their original calendar while moving the case's account date.
    test.vars = JSON.parse(JSON.stringify(test.vars).replace(/\{accountDate([+]\d+)\}/g,
      (_, offset) => dateOffset('2026-10-23', Number(offset))))
    const { habits } = structuredClone(entry.toolCalls[0].arguments)
    expect(outcomeOf(test, habits).pass).toBe(entry.repeat === 2 && entry.caseId.endsWith('-en'))
    habits[0].due_date = '2026-10-27'
    expect(outcomeOf(test, habits).pass).toBe(false)
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
