import { expect, it } from 'vitest'
import { freshConversation } from '../offer-context.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { preview, habitBlock } from './fixtures/producer.mjs'
import { readFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(new URL('./fixtures/offer-contract.json', import.meta.url), 'utf8'))

const today = '2031-06-10'
const habitId = '22222222-2222-4222-8222-222222222222'
const action = { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview', label: 'Log this habit',
  prompt: 'Log Water today.', surface: null, entityId: habitId, date: today }
const read = { queryId: '33333333-3333-4333-8333-333333333333', queryFamily: 'query_habits', scope: {},
  revision: 'revision', completeness: 'complete', refreshToken: 'refresh', nextCursor: null,
  totalCount: 1, recovery: null, nextAction: action }
const clientContext = { supportsParts: true, supportsProactiveOffers: true, locale: 'en', partKinds: ['habitList'] }
function sample() {
  return { composition: { aiMessage: null, parts: [{ ...structuredClone(habitBlock), block: {
    ...structuredClone(habitBlock.block), items: [{ ...habitBlock.block.items[0], id: habitId }], read: structuredClone(read),
  } }] }, trace: { calls: [] } }
}
const vars = { offerFamily: 'due-log', accountDate: today, clientContext,
  composition: { mode: 'data' }, fixtureEvidence: { habits: [{ id: habitId, isBadHabit: false, logs: [] }] } }

it('replaces conversation seeds across setup and later turns for every attempt', () => {
  const seed = '11111111-1111-4111-8111-111111111111'
  const variables = { clientContext: { conversationId: seed }, setup: { clientContext: { conversationId: seed } } }
  freshConversation(variables)
  const first = variables.clientContext.conversationId
  expect(first).not.toBe(seed)
  expect(variables.setup.clientContext.conversationId).toBe(first)
  freshConversation(variables)
  expect(variables.clientContext.conversationId).not.toBe(first)
  expect(variables.setup.clientContext.conversationId).toBe(variables.clientContext.conversationId)
})

it('projects action labels and prompts into the answer the rubric actually grades', () => {
  const answer = visibleAnswer(sample().composition, clientContext, today)
  expect(answer).toContain('Log this habit')
  expect(answer).toContain('Log Water today.')
  const pending = preview()
  pending.nextAction = { ...action, offerKey: 'calendar:calendar-sync', kind: 'openSurface', prompt: null,
    entityId: null, date: null, surface: 'calendar-sync', label: 'Connect Google Calendar' }
  pending.items[0].fields[0].provenance = 'suggested'
  pending.items[0].fields[0].removal = { offerKey: 'preview:reminder', field: 'due_time', fields: ['due_time'] }
  expect(visibleAnswer({ aiMessage: null, parts: [], pendingOperations: [pending] }, clientContext, today))
    .toContain('Connect Google Calendar')
})

it('accepts an owned due occurrence and rejects deliberately wrong actions', () => {
  expect(proactiveOffers(sample(), { vars }).pass).toBe(true)
  for (const patch of [{ kind: 'write' }, { entityId: 'unknown' }, { date: '2031-06-09' }, { prompt: '' }]) {
    const output = sample()
    Object.assign(output.composition.parts[0].block.read.nextAction, patch)
    expect(proactiveOffers(output, { vars }).pass).toBe(false)
  }
  for (const patch of [{ completeness: 'partial' }, { recovery: 'stale' }, { revision: '' }, { queryId: 'wrong' }]) {
    const output = sample()
    Object.assign(output.composition.parts[0].block.read, patch)
    expect(proactiveOffers(output, { vars }).pass).toBe(false)
  }
  for (const row of [{ isSkippedOnDate: true }, { isBadHabit: true }, { status: 'done' }]) {
    const output = sample()
    Object.assign(output.composition.parts[0].block.items[0], row)
    expect(proactiveOffers(output, { vars }).pass).toBe(false)
  }
})

it('checks the complete action contract captured from the producer OpenAPI', () => {
  expect(Object.keys(action).sort()).toEqual(Object.keys(contract.AstraNextAction.properties).sort())
  for (const key of contract.AstraNextAction.required) {
    const output = sample()
    delete output.composition.parts[0].block.read.nextAction[key]
    expect(proactiveOffers(output, { vars }).pass).toBe(false)
  }
  for (const patch of [{ offerKey: 1 }, { offerKey: `log:${habitId}:2031-06-09` },
    { kind: 'openSurface', surface: 'today', prompt: null }, { entityId: null }]) {
    const output = sample()
    Object.assign(output.composition.parts[0].block.read.nextAction, patch)
    expect(proactiveOffers(output, { vars }).pass).toBe(false)
  }
})

it('distinguishes an empty complete day from all completed and partial-page empty scopes', () => {
  const output = sample()
  output.composition.parts[0].kind = 'daySummary'
  const block = output.composition.parts[0].block
  Object.assign(block, { date: today, due: 0, done: 0, overdueCount: 0 })
  block.read.nextAction = { ...action, offerKey: `smallStep:account:${today}`, entityId: null, kind: 'continueChat' }
  const policy = { ...vars, offerFamily: 'empty' }
  expect(proactiveOffers(output, { vars: policy }).pass).toBe(true)
  Object.assign(block, { due: 2, done: 2 })
  expect(proactiveOffers(output, { vars: policy }).pass).toBe(true)
  block.done = 1
  expect(proactiveOffers(output, { vars: policy }).pass).toBe(false)
  block.done = 2
  block.read.completeness = 'partial'
  expect(proactiveOffers(output, { vars: policy }).pass).toBe(false)
  block.read.completeness = 'complete'
  block.date = '2031-06-09'
  expect(proactiveOffers(output, { vars: policy }).pass).toBe(false)
})

it('rejects a missing action, multiple offers, unrequested execution and unsupported clients', () => {
  const missing = sample()
  delete missing.composition.parts[0].block.read.nextAction
  expect(proactiveOffers(missing, { vars }).pass).toBe(false)
  const multiple = sample()
  multiple.composition.parts.push(structuredClone(multiple.composition.parts[0]))
  expect(proactiveOffers(multiple, { vars }).pass).toBe(false)
  const written = sample()
  written.trace.calls.push({ name: 'log_habit', resultStatus: 'Succeeded' })
  expect(proactiveOffers(written, { vars }).pass).toBe(false)
  expect(proactiveOffers(sample(), { vars: { ...vars, clientContext: { ...clientContext, supportsProactiveOffers: false } } }).pass).toBe(false)
})
