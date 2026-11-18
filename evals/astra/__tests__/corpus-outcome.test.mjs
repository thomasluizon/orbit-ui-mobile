import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { tsImport } from 'tsx/esm/api'
import { changeList } from '../core/change-list.mjs'
import { composition } from '../composition.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
import { corpusTests, gradedByOutcome, readCorpus } from '../grade-method.mjs'
import { summarize } from '../report.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { describeCase } from '../latency.mjs'
import parseResponse from '../response.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { recordedStream } from './fixtures/core-replay.mjs'
import { apiKeysStepUpResponse, createPreview as createBulkPreview, habitBlock, preview, toolCall, traceTiming } from './fixtures/producer.mjs'
import { startingResponse } from './fixtures/starting-step.mjs'
import { recordedGateThirteen } from './fixtures/gate-thirteen.mjs'

const { buildChatClientContext } = await tsImport('../../../packages/shared/src/chat/client-context.ts', import.meta.url)
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-seven.json', import.meta.url), 'utf8'))
const recordedWrappers = JSON.parse(readFileSync(new URL('./fixtures/gate-eight.json', import.meta.url), 'utf8'))
const corpus = readCorpus()
const requestId = '77777777-7777-4777-8777-777777777777'
const water = '11111111-aaaa-4aaa-8aaa-111111111111'
const walk = '22222222-bbbb-4bbb-8bbb-222222222222'
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u
const finalOf = (name, turn) => captures[name].turns[turn].at(-1).response
const questionCard = finalOf('complete', 0)
const heldPreview = finalOf('complete', 1)
const textReply = { ...questionCard, aiMessage: 'Which habit do you mean?', parts: [{ type: 'text', text: 'Which habit do you mean?' }] }
const blockReply = { ...questionCard, aiMessage: '', parts: [habitBlock] }

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// The vars of one corpus case as the beforeEach hook leaves them: the dates of the case resolved against the account
// date, the client context that the case states over the shared one, and the records of the fixture by name.
function prepared(id, accountDate = '2026-11-13') {
  const source = corpus.find((entry) => entry.metadata.id === id)
  const day = (offset) => new Date(Date.parse(`${accountDate}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
  const vars = JSON.parse(JSON.stringify(source.vars).replace(/\{accountDate([+-]\d+)\}/gu, (_, offset) => day(Number(offset))))
  const { platform = 'web', locale = 'en' } = source.metadata
  const built = buildChatClientContext({ platform, locale })
  const clientContext = !vars.clientContext ? built : vars.clientContext.supportsParts === true ? { ...built, ...vars.clientContext } : vars.clientContext
  return { ...vars, clientContext, accountDate, accountTimeZone: 'UTC', evalRequestId: requestId,
    records: { water, walk, first: water, second: walk },
    fixtureEvidence: { habits: [{ id: water, title: 'Post Lunch', logs: [] }, { id: walk, title: 'Before Bed', logs: [] }] } }
}

// Runs one corpus case through the provider path of a converted case against replies that the test gives in order.
async function scripted(id, replies, { trace = null } = {}) {
  const vars = prepared(id)
  const sent = []
  let turn = 0
  const send = async (_conversation, attempted) => {
    sent.push(attempted)
    const reply = replies[turn++]
    return reply.kind === 'failed' ? reply : { kind: 'final', response: reply, requestId, responseRequestId: requestId,
      trace: trace ? { requestId, calls: trace, timing: traceTiming, modelCalls: 1 } : null }
  }
  const response = await runOutcomeCase(vars, { send })
  return { vars, sent, response, verdict: response.output ? outcome(response.output, { vars }) : null }
}

// Producer: orbit-api AgentArgumentPreview.Build gives a create preview one row for each argument, the title first.
function createPreview(title, values) {
  const held = preview(title)
  const row = held.items[0].fields[0]
  held.items[0].fields = Object.entries({ title, ...values }).map(([field, value]) => ({ ...row, field, newValue: value, proposedValue: value, valueType: 'text' }))
  return held
}
const reply = (pendingOperations) => ({ ...questionCard, aiMessage: '', parts: [], pendingOperations })
const meditar = () => createPreview('Meditar', { frequency_unit: 'Day', frequency_quantity: '1' })

describe('how a case selects its grade method', () => {
  it('gives a case with an outcome the outcome grade alone, and each other case the six assertions of the tool-name grade', () => {
    const tests = corpusTests()
    expect(tests.map((test) => test.metadata.id)).toEqual(corpus.map((entry) => entry.metadata.id))
    const read = tests.find((test) => test.metadata.id === 'single-read-en')
    expect(read.options).toEqual({ disableDefaultAsserts: true })
    expect(read.assert.map((assertion) => assertion.metric)).toEqual(['outcome', 'composition', 'finalAnswer'])
    expect(read.assert[2]).toEqual(configuration.defaultTest.assert.find((assertion) => assertion.type === 'llm-rubric'))
    const write = tests.find((test) => test.metadata.id === 'single-log-en')
    expect(write.assert.map((assertion) => assertion.metric)).toEqual(['outcome', 'composition'])
    const toolName = tests.find((test) => test.metadata.id === 'offers-repeat-en')
    expect(toolName.options).toBeUndefined()
    expect(toolName.assert).toBeUndefined()
    expect(configuration.defaultTest.assert.map((assertion) => assertion.metric))
      .toEqual(['toolStructure', 'toolBehavior', 'composition', 'savedStep', 'proactiveOffers', 'finalAnswer'])
    expect(configuration.tests).toBe('file://grade-method.mjs:corpusTests')
  })

  it('reads the method from the outcome key', () => {
    expect(gradedByOutcome({ outcome: { read: true } })).toBe(true)
    expect(gradedByOutcome({ expectations: { allowed: [] } })).toBe(false)
  })
})

describe('a converted write case', () => {
  it('passes when the held preview holds the requested change', async () => {
    const { verdict, sent } = await scripted('single-create-pt', [reply([meditar()])])
    expect(verdict).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
    expect(sent).toEqual([{ content: 'Crie o hábito Meditar, uma vez por dia.' }])
  })

  it('fails when the preview holds one more record', async () => {
    const held = meditar()
    held.items.push({ ...structuredClone(held.items[0]), itemId: 'other', entityName: 'Correr',
      fields: held.items[0].fields.map((field) => ({ ...field, entityName: 'Correr', ...(field.field === 'title' ? { newValue: 'Correr', proposedValue: 'Correr' } : {}) })) })
    const { verdict } = await scripted('single-create-pt', [reply([held])])
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/^The preview holds a change outside the request\./u)
  })

  it('fails when one field holds another value', async () => {
    const { verdict } = await scripted('single-create-pt', [reply([createPreview('Meditar', { frequency_unit: 'Week', frequency_quantity: '1' })])])
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/^The preview does not create exactly the records of the request\./u)
  })

  it('approves nothing and reads no saved state back', async () => {
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    const { response } = await scripted('single-create-pt', [reply([meditar()])])
    expect(response.output.readback).toBeUndefined()
    expect(api).not.toHaveBeenCalled()
  })

  it('holds no rubric, so no model grades it', () => {
    for (const { vars } of corpus.filter((entry) => entry.vars.outcome?.changes)) expect(vars.rubric).toBeUndefined()
  })
})

// The same held preview under three traces. Producer: on the old path the trace names the write tool that the model
// called. On the flag path it names each change by its change kind with the id of the change (orbit-api
// ProcessUserChatCommand.ChangeList.cs, ChangeListReplayTests.ChangeList_TheEvalTraceRecordsEachChangeWithItsKindAndArguments),
// and create_habit is the kind bulk_create_habits (ChangeKinds.MergedForms).
describe('the tool names of the trace', () => {
  const habit = { title: 'Meditar', frequency_unit: 'Day', frequency_quantity: 1 }
  const call = (name, arguments_, id) => ({ id, name, arguments: arguments_, resultStatus: 'PendingConfirmation', result: toolCall(name, arguments_, 'PendingConfirmation', id).result })
  const traces = {
    'the single tool of the old path': [call('create_habit', habit, 'call-1')],
    'the bulk tool of the old path': [call('bulk_create_habits', { habits: [habit] }, 'call-1')],
    'the change kind of the flag path': [call('bulk_create_habits', { habits: [habit] }, 'create')],
  }
  // The server derives this row: no held write names its field, so the grader needs the trace and reads no name in it.
  const held = () => {
    const preview_ = meditar()
    preview_.items[0].fields.push({ ...preview_.items[0].fields[0], field: 'reminder_enabled', newValue: 'False', proposedValue: false, provenance: 'stored' })
    return preview_
  }

  it.each(Object.keys(traces))('gives the same verdict under %s', async (name) => {
    const { verdict } = await scripted('single-create-pt', [reply([held()])], { trace: traces[name] })
    expect(verdict).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  })

  it('gives no evidence when the turn returned no trace for a row that the server can derive', async () => {
    const { response } = await scripted('single-create-pt', [reply([held()])])
    expect(response.output.unavailable).toBe(true)
    expect(response.error).toMatch(/returned no eval trace/u)
  })
})

describe('a converted case that must end in a question', () => {
  it('passes on a question card and does not answer it', async () => {
    const { verdict, sent } = await scripted('ambiguity-en', [questionCard])
    expect(verdict).toMatchObject({ pass: true, reason: 'The turn ended in a question card and held no preview.' })
    expect(sent).toHaveLength(1)
  })

  it('fails on a text-only reply', async () => {
    const { verdict } = await scripted('ambiguity-en', [textReply])
    expect(verdict).toMatchObject({ pass: false, reason: 'The request must end in a question card, and the reply shows none.' })
  })

  it('fails on a preview', async () => {
    const { verdict } = await scripted('ambiguity-en', [heldPreview])
    expect(verdict).toMatchObject({ pass: false, reason: 'The request must end in a question, and the reply held a preview of a change.' })
  })
})

describe('a converted read case', () => {
  it('passes on a reply with blocks and no preview', async () => {
    const { verdict, response } = await scripted('single-read-en', [blockReply])
    expect(verdict).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
    expect(response.output.composition.parts).toEqual([habitBlock])
  })

  it('fails on a reply with a preview', async () => {
    const { verdict } = await scripted('single-read-en', [heldPreview])
    expect(verdict).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
  })

  it('fails on a card that asks the person', async () => {
    const { verdict } = await scripted('single-read-en', [questionCard])
    expect(verdict).toMatchObject({ pass: false, reason: 'The read request ended in a card that asks the person to act.' })
  })
})

// Producer: the shared turn loop gives a refused turn its status, its code and its message (getChatTurnFailure), from
// the HTTP response or from the error event of the stream (orbit-api ChatStreamEvent.Failure).
describe('a converted refusal case', () => {
  const refused = (status, code) => ({ kind: 'failed', status, code, error: 'You reached the message limit of today.', responseRequestId: requestId })

  it('passes on the status and the code of the case, and keeps the refusal as the answer', async () => {
    const { verdict, response, vars } = await scripted('budget-cap-en', [refused(403, 'PAY_GATE')])
    expect(response.error).toBeUndefined()
    expect(verdict).toMatchObject({ pass: true, reason: 'The request was refused with HTTP 403 (PAY_GATE).' })
    expect(response.output).toMatchObject({ httpStatus: 403, answer: 'You reached the message limit of today.',
      httpError: { status: 403, errorCode: 'PAY_GATE' }, trace: { state: 'refused', responseRequestId: requestId, refusalCode: 'PAY_GATE' } })
    expect(composition(response.output, { vars })).toMatchObject({ pass: true, reason: 'Verified concise quota refusal.' })
  })

  // The evidence of an HTTP 400 refusal names the response that refused it, as the answer of POST /api/chat does (response.mjs).
  it('keeps the request id of an HTTP 400 refusal in its HTTP error, and of no other status', async () => {
    const moderation = await scripted('legacy-moderation-pt', [refused(400, 'CONTENT_MODERATION_REFUSED')])
    expect(moderation.verdict).toMatchObject({ pass: true, reason: 'The request was refused with HTTP 400 (CONTENT_MODERATION_REFUSED).' })
    expect(moderation.response.output.httpError).toEqual({ status: 400, errorCode: 'CONTENT_MODERATION_REFUSED',
      error: 'You reached the message limit of today.', responseRequestId: requestId })
    const quota = await scripted('budget-cap-en', [refused(403, 'PAY_GATE')])
    expect(quota.response.output.httpError).toEqual({ status: 403, errorCode: 'PAY_GATE', error: 'You reached the message limit of today.' })
  })

  it('fails on another code', async () => {
    const { verdict } = await scripted('budget-cap-en', [refused(403, 'FORBIDDEN')])
    expect(verdict).toMatchObject({ pass: false, reason: 'The request was refused with HTTP 403 (FORBIDDEN); the case expects HTTP 403 (PAY_GATE).' })
  })

  it('fails when the assistant answers the request', async () => {
    const { verdict } = await scripted('budget-cap-en', [textReply])
    expect(verdict).toMatchObject({ pass: false, reason: 'The request must be refused with HTTP 403 (PAY_GATE), and the assistant answered it.' })
  })

  it('keeps a throttled turn as missing evidence', async () => {
    const { response } = await scripted('budget-cap-en', [refused(429, null)])
    expect(response.output.unavailable).toBe(true)
    expect(response.error).toMatch(/HTTP 429/u)
  })

  it.each(['budget-cap-en', 'composition-quota-en', 'composition-quota-pt-BR', 'legacy-moderation-pt'])('keeps the status and the code of %s', (id) => {
    const { vars } = corpus.find((entry) => entry.metadata.id === id)
    expect(vars.outcome).toEqual({ refusal: true })
    expect([vars.expectedHttpStatus, vars.expectedErrorCode]).toEqual(id === 'legacy-moderation-pt' ? [400, 'CONTENT_MODERATION_REFUSED'] : [403, 'PAY_GATE'])
  })
})

// Producer: orbit-api ChatTurnStream ends a turn whose result failed with the status of its error code, which is
// HTTP 400 for AI_UNAVAILABLE, and a turn that threw with HTTP 500 and the same code. The outage is a recorded attempt
// of the gate (gate-thirteen.json).
describe('a converted case in a provider outage', () => {
  const { httpError } = recordedGateThirteen().find((row) => row.httpError?.errorCode === 'AI_UNAVAILABLE')
  const outage = (status = httpError.status) => ({ kind: 'failed', status, code: httpError.errorCode, error: httpError.error, responseRequestId: requestId })
  const window = (id, { vars, response }) => {
    const testCase = { ...corpus.find((entry) => entry.metadata.id === id), vars }
    return { descriptor: describeCase(testCase), summary: summarize([{ testCase, success: false, response, error: response.error }], [describeCase(testCase)]) }
  }

  it.each([['a read case', 'single-read-en'], ['a write case', 'single-log-en'], ['a case that must end in a question', 'ambiguity-en'],
    ['a refusal case', 'budget-cap-en'], ['the moderation refusal case', 'legacy-moderation-pt']])('keeps %s incomplete, so a later window can complete it', async (_form, id) => {
    const attempt = await scripted(id, [outage()])
    expect(attempt.response.error).toMatch(/AI_UNAVAILABLE/u)
    expect(attempt.response.output).toMatchObject({ unavailable: true, httpStatus: 400,
      httpError: { status: 400, errorCode: 'AI_UNAVAILABLE', error: httpError.error, responseRequestId: requestId } })
    expect(attempt.response.output.refused).toBeUndefined()
    const { descriptor, summary } = window(id, attempt)
    expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', passed: 0, unavailable: 1, unavailableReasons: [attempt.response.error] })
    expect(() => mergeReports([summary, summary], [descriptor])).not.toThrow()
    // The replay of a recorded window reads the same attempt as missing evidence (replay.mjs).
    const { httpStatus, httpError: kept } = attempt.response.output
    expect(parseResponse(kept, '', { response: { status: httpStatus, headers: { 'x-orbit-request-id': kept.responseRequestId } } }).output.unavailable).toBe(true)
  })

  it.each(['single-read-en', 'legacy-moderation-pt'])('keeps a turn of %s that threw on the server a failure', async (id) => {
    const attempt = await scripted(id, [outage(500)])
    expect(attempt.response.output.unavailable).not.toBe(true)
    const { descriptor, summary } = window(id, attempt)
    expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'fail', unavailable: 0 })
    expect(() => mergeReports([summary, summary], [descriptor])).toThrow(`Case ${id} failed; declare its permitted rerun with --rerun.`)
  })
})

describe('the kinds that the change list gained', () => {
  // Producer: PendingAgentOperationStore.Map holds a read behind a step-up as a preview without items, and
  // PendingOperationActionKeys names the API key read viewApiKeys.
  it('classifies the step-up of the API key read as a view', async () => {
    const stepUp = apiKeysStepUpResponse(requestId, {})
    expect(changeList(stepUp.pendingOperations).changes).toEqual([{ kind: 'view', target: null, preview: stepUp.pendingOperations[0].id,
      fields: {}, offered: {}, derived: {}, undetermined: {}, drafts: [] }])
    const { verdict, vars, response } = await scripted('composition-api-keys-en', [stepUp])
    expect(verdict).toMatchObject({ pass: true })
    expect(composition(response.output, { vars })).toMatchObject({ pass: true, reason: 'Verified API-key step-up surface.' })
  })

  it('fails the view case when the reply holds no step-up', async () => {
    const { verdict } = await scripted('composition-api-keys-en', [blockReply])
    expect(verdict).toMatchObject({ pass: false, reason: 'The reply holds no preview and no question card.' })
  })

  it('reports an action key that it does not classify as a limit of the grader, with the key', async () => {
    const unknown = structuredClone(heldPreview)
    unknown.pendingOperations[0].actionKey = 'moveHabit'
    unknown.pendingOperations[0].items = [unknown.pendingOperations[0].items.find((item) => !item.fields.some((field) => field.valueType === 'action'))]
    const { verdict, response, vars } = await scripted('single-create-pt', [unknown])
    expect(verdict).toMatchObject({ pass: false, reason: 'The grader cannot classify a held preview: moveHabit.',
      metadata: { graderLimit: true, unavailable: true } })
    // The launch report keeps the case incomplete with the key in its reason: it is no failure of the assistant.
    const metadata = { id: 'single-create-pt', family: 'bilingual', locale: 'pt-BR' }
    const graded = { testCase: { metadata, vars }, success: false, response, gradingResult: { componentResults: [
      { ...verdict, assertion: { metric: 'outcome' } }, { pass: true, assertion: { metric: 'composition' } }] } }
    expect(summarize([graded], [metadata]).cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', passed: 0, unavailable: 1,
      unavailableReasons: ['The grader cannot classify a held preview: moveHabit.'] })
  })

  it('classifies a preview without items and with another action key as before', () => {
    const [stepUp] = apiKeysStepUpResponse(requestId, {}).pendingOperations
    expect(changeList([{ ...stepUp, actionKey: 'syncCalendar' }])).toEqual({ changes: [], unclassified: [] })
  })

  // The recorded medical attempts of the gate (gate-seven.json): the preview as the client draws it, and the held write.
  // Producer: CreationFields gives a `sub_habits` row the child drafts of the write as its proposedValue.
  const attemptPreview = (attempt) => {
    const [held] = JSON.parse(attempt.answer).pendingOperations
    const drafts = attempt.toolCalls.find((call) => call.name === 'bulk_create_habits').arguments.habits
    const template = preview().items[0]
    return { ...preview(), changeTargetCount: held.count, items: held.items.map((item, index) => ({ ...template, itemId: String(index), entityName: item.title,
      fields: item.fields.map(({ field, newValue }) => ({ ...template.fields[0], entityName: item.title, field,
        ...(field === 'sub_habits' ? { newValue: JSON.stringify(drafts[index].sub_habits), proposedValue: drafts[index].sub_habits, valueType: 'text' }
          : { newValue: newValue ?? null, proposedValue: newValue ?? null, valueType: 'text' }) })) })) }
  }
  const medical = recorded.filter((attempt) => attempt.caseId === 'composition-medical-batch-en')
  const nested = attemptPreview(medical.find((attempt) => JSON.parse(attempt.answer).pendingOperations[0].count === 2))
  const flat = attemptPreview(medical.find((attempt) => JSON.parse(attempt.answer).pendingOperations[0].count === 5))

  it('lists each child draft of a create as its own create for a corpus case', () => {
    const { changes, unclassified } = changeList([nested], [], { nestedCreates: true })
    expect(unclassified).toEqual([])
    expect(changes.map((change) => [change.kind, change.fields.title])).toEqual([
      ['create', 'Cholesterol exam at home'], ['create', 'Other blood tests at home'], ['create', 'Stop taking multivitamins'],
      ['create', "Don't go to Muay Thai"], ['create', 'Fast until the collection']])
    expect(changes[2].fields).toMatchObject({ frequency_unit: 'Day', due_date: '2026-10-27', end_date: '2026-10-30', is_bad_habit: 'False' })
    expect(changes[4].fields).toMatchObject({ frequency_unit: 'Day', due_date: '2026-10-30', due_end_time: '13:30' })
  })

  it('keeps the child drafts out of the change list of the core set', () => {
    expect(changeList([nested], []).changes.map((change) => change.fields.title)).toEqual(['Cholesterol exam at home', 'Other blood tests at home'])
  })

  it('grades the flat and the nested preview of one request against one expected list', () => {
    const vars = prepared('composition-medical-batch-en', '2026-10-23')
    const attempt = (held) => ({ turns: 1, questionsBeforePreview: 0, previews: [held], asked: false, written: [] })
    expect(outcome(attempt(flat), { vars })).toMatchObject({ pass: true })
    // The recorded nested attempt failed the case: another title for the first commitment, and another schedule for
    // the other two. The test gives each child draft the values that the request names.
    expect(outcome(attempt(nested), { vars }).pass).toBe(false)
    const corrected = structuredClone(nested)
    const [vitamins, training, fast] = corrected.items[1].fields.find((field) => field.field === 'sub_habits').proposedValue
    vitamins.title = "Don't take multivitamins"
    Object.assign(training, { frequency_unit: 'Day', end_date: '2026-10-30' })
    fast.frequency_unit = 'OneTime'
    expect(outcome(attempt(corrected), { vars })).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
    vitamins.is_bad_habit = true
    expect(outcome(attempt(corrected), { vars }).pass).toBe(false)
  })

  // The recorded attempt of the existing parents: each new record is one item whose parent row shows the parent title.
  it('reads the parent of a new record by its fixture name', () => {
    const held = attemptPreview(recorded.find((attempt) => attempt.caseId === 'composition-existing-parents-en'))
    const vars = prepared('composition-existing-parents-en')
    const attempt = { turns: 1, questionsBeforePreview: 0, previews: [held], asked: false, written: [] }
    expect(outcome(attempt, { vars })).toMatchObject({ pass: true })
    held.items[1].fields.find((field) => field.field === 'parent_habit_id').newValue = 'Post Lunch'
    expect(outcome(attempt, { vars }).pass).toBe(false)
  })

  // The recorded wrapper of the existing parents (gate-eight.json): each stored parent is one item that the create reuses
  // (a habit_id row, and its record id as the item entity id), and each child draft names no parent of its own.
  // Producer: PendingOperationChangePreviewer.PreviewCreateAsync gives the reused item `existing?.Id` as its entity id.
  describe('a child draft under a reused parent', () => {
    const wrapperDrafts = recordedWrappers.find((attempt) => attempt.caseId === 'composition-existing-parents-pt-BR').toolCalls.at(-1).arguments.habits
    // Producer: BindReuseFieldsAsync gives each row of a reused item the stored record as its entity and the stored value
    // of its field as the old value (HabitValues, with the title for the habit_id row and the encoded children for
    // sub_habits), and PreserveReuseParent adds a parent row that leaves the stored parent as it is. The seeded parents
    // are daily habits with no emoji and no reminder.
    const stored = { frequency_unit: 'Day', frequency_quantity: '1', is_general: 'False', is_bad_habit: 'False', is_flexible: 'False' }
    const wrapped = (parentIds, edits = [{}, {}]) => {
      const held = createBulkPreview(structuredClone(wrapperDrafts).map((draft, index) => ({ ...draft, habit_id: parentIds[index], ...edits[index] })))
      held.items.forEach((item, index) => {
        const title = wrapperDrafts[index].title
        item.entityId = parentIds[index]
        for (const field of item.fields) {
          Object.assign(field, { entityId: parentIds[index], entityName: title,
            oldValue: field.field === 'title' || field.field === 'habit_id' ? title : field.field === 'sub_habits' ? '[{}]' : stored[field.field] ?? null })
        }
        item.fields.push({ ...item.fields[0], field: 'parent_habit_id', oldValue: 'No parent', newValue: 'No parent', proposedValue: null })
      })
      return held
    }
    const grade = (held) => outcome({ turns: 1, questionsBeforePreview: 0, previews: [held], asked: false, written: [] },
      { vars: prepared('composition-existing-parents-pt-BR') })

    it('takes the parent of each child from the reused item that holds it', () => {
      expect(wrapperDrafts.map((draft) => draft.sub_habits[0].parent_habit_id)).toEqual([null, null])
      expect(grade(wrapped([water, walk]))).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
    })

    it('fails a child that goes under the other stored parent', () => {
      expect(grade(wrapped([walk, water]))).toMatchObject({ pass: false })
    })

    it('fails a child draft that names another parent of its own', () => {
      const held = wrapped([water, walk])
      held.items[0].fields.find((field) => field.field === 'sub_habits').proposedValue[0].parent_habit_id = 'different-parent'
      expect(grade(held)).toMatchObject({ pass: false })
    })

    it('keeps a reused parent that the wrapper leaves as it is out of the change list', () => {
      const { changes } = changeList([wrapped([water, walk])], [], { nestedCreates: true })
      expect(changes.map((change) => change.kind)).toEqual(['create', 'create'])
    })

    it.each([
      ['a new title', { title: 'Renamed heading' }, 'title'],
      ['an emoji', { emoji: '💊' }, 'emoji'],
      ['a reminder', { reminder_enabled: true }, 'reminder_enabled'],
      ['another frequency unit', { frequency_unit: 'Year' }, 'frequency_unit'],
    ])('lists %s that the wrapper sets on a reused parent as an update of that parent', (_name, edit, field) => {
      const { changes } = changeList([wrapped([water, walk], [edit, {}])], [], { nestedCreates: true })
      expect(changes.filter((change) => change.kind === 'update')).toMatchObject([{ target: water, fields: { [field]: expect.anything() } }])
      expect(grade(wrapped([water, walk], [edit, {}]))).toMatchObject({ pass: false })
    })

    it('fails an edit of the second reused parent', () => {
      expect(grade(wrapped([water, walk], [{}, { emoji: '💊' }]))).toMatchObject({ pass: false })
    })

    it('gives a child of a new parent no parent field', () => {
      const { changes } = changeList([nested], [], { nestedCreates: true })
      expect(changes.map((change) => change.fields.parent_habit_id)).toEqual([undefined, undefined, undefined, undefined, undefined])
    })
  })
})

describe('the question cases of the first group', () => {
  it('asks for a question card in the outcome and in the rubric alike', () => {
    const asking = corpus.filter((entry) => gradedByOutcome(entry.vars) && entry.vars.outcome.question)
    expect(asking.map((entry) => entry.metadata.id)).toEqual(expect.arrayContaining(['ambiguity-pt', 'ambiguity-en']))
    for (const entry of asking) expect(entry.vars.rubric, entry.metadata.id).not.toMatch(/plain text/u)
  })
})

describe('the starting step of a case with an outcome', () => {
  const graded = (response) => composition({ composition: response }, { vars: prepared('composition-coaching-advice-en') })
  const block = () => ({ ...startingResponse('en', requestId), aiMessage: null, evalTrace: undefined })

  it('passes one starting step with its actions and no other surface', () => {
    expect(graded(block())).toMatchObject({ pass: true })
  })

  it.each([
    ['an operation that failed', { operations: [{ operationId: 'suggest_habits', status: 'Failed' }] }],
    ['a follow-up', { followUps: ['Anything else?'] }],
  ])('fails a starting step beside %s', (_name, extra) => {
    expect(graded({ ...block(), ...extra })).toMatchObject({ pass: false, reason: 'Missing one starting-step block with server actions and no prose.' })
  })

  it('passes a starting step beside an operation that succeeded', () => {
    expect(graded({ ...block(), operations: [{ operationId: 'suggest_breakdown', status: 'Succeeded' }] })).toMatchObject({ pass: true })
  })
})

describe('the client path of a converted case', () => {
  async function sentContext(id) {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const requests = []
    vi.stubGlobal('fetch', recordedStream([captures.complete.turns[0]], requests))
    const vars = prepared(id)
    await runOutcomeCase(vars)
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://orbit-api-staging-uqu2.onrender.com/api/chat/stream')
    expect(requests[0].headers['x-orbit-request-id']).toBe(requestId)
    return { vars, context: JSON.parse(requests[0].form.get('clientContext')), form: requests[0].form }
  }

  it('sends the shared client context with a conversation id for a case that states no context', async () => {
    const { context } = await sentContext('single-read-en')
    expect(context).toEqual({ ...buildChatClientContext({ platform: 'web', locale: 'en', conversationId: context.conversationId, dismissedOfferKeys: [] }),
      supportsProactiveOffers: false })
    expect(context.conversationId).toMatch(guid)
  })

  it.each(['single-read-en', 'composition-tags-en', 'composition-existing-parents-en', 'composition-compound-missing-kind-en'])(
    'sends %s with offers off, as the context that grades it states', async (id) => {
      const { context, vars } = await sentContext(id)
      expect(context.supportsProactiveOffers).toBe(false)
      expect(vars.clientContext.supportsProactiveOffers ?? false).toBe(context.supportsProactiveOffers)
    })

  it('keeps the context of a client with no parts and adds the conversation id alone', async () => {
    const { context } = await sentContext('legacy-create-pt')
    expect(context).toEqual({ conversationId: expect.stringMatching(guid) })
    const legacy = await sentContext('composition-compound-legacy-en')
    expect(legacy.context).toEqual({ ...legacy.vars.clientContext, conversationId: expect.stringMatching(guid) })
    expect(legacy.context.supportsParts).toBe(false)
  })

  it('keeps the absent block kinds of a case over the shared client context', async () => {
    const { context, vars } = await sentContext('composition-compound-missing-kind-en')
    expect(context.partKinds).toEqual([])
    expect(context).toEqual({ ...buildChatClientContext({ platform: 'web', locale: 'en', conversationId: context.conversationId, dismissedOfferKeys: [] }),
      supportsProactiveOffers: false, ...vars.clientContext })
  })

  it('sends the recorded history of a case as the messages that the client holds', async () => {
    const { form } = await sentContext('composition-proactive-en')
    expect(form.get('message')).toBe('Show what is left for today from this reminder.')
    expect(JSON.parse(form.get('history'))).toEqual([{ role: 'assistant', content: 'You have habits left for today. Want to see what is pending?' }])
  })

  it('returns a precondition failure before any turn', async () => {
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    expect(await runOutcomeCase({ ...prepared('single-read-en'), preconditionFailure: 'Fixture reset failed.' })).toEqual({
      error: 'Precondition unavailable: Fixture reset failed.',
      metadata: { astraPreconditionFailure: true, astraPreconditionReason: 'Fixture reset failed.' } })
    expect(api).not.toHaveBeenCalled()
  })
})
