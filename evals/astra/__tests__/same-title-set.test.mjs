import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { tsImport } from 'tsx/esm/api'
import { behavior, composition } from '../assertions.mjs'
import { sameTitleProposal, sameTitleReadback } from '../same-title-set.mjs'
import { sameTitleCard } from '../same-title-card.mjs'
import { completeSameTitleSet } from '../same-title-set-lifecycle.mjs'
import { readSameTitleSet } from '../fixtures/same-title-set.mjs'
import { publicApi } from '../fixtures/api.mjs'
import { resetFixture } from '../fixtures/reset.mjs'
import { sameTitleSet } from '../fixtures/names.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { streams } from './fixtures/same-title-streams.mjs'

const { AnswerBlockController } = await tsImport('../../../packages/shared/src/chat/answer-block-controller.ts', import.meta.url)
const { QuestionBlockController } = await tsImport('../../../packages/shared/src/chat/question-block-core.ts', import.meta.url)
const { BlockAnswerSubmission } = await tsImport('../../../packages/shared/src/chat/block-answer-submission.ts', import.meta.url)

const corpus = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const family = corpus.filter((entry) => entry.metadata.family === 'same-title-set')
const controls = corpus.filter((entry) => entry.metadata.family === 'same-title-control')
const ids = Array.from({ length: 6 }, (_, index) => `22222222-2222-4222-8222-22222222222${index}`)
const parent = { id: '33333333-3333-4333-8333-333333333333', title: 'Water' }
const baselineOf = (children) => ({ parent, children: children.map((id, position) => ({ id, title: 'Water - 710ml', position })) })
const baseline = baselineOf(ids)
// Producer: orbit-api PendingOperationActionKeys maps apply_account_changes to this wire action key.
const combinedActionKey = 'applyAccountChanges'
const operationIds = { deleteHabits: '44444444-4444-4444-8444-444444444441', updateHabits: '44444444-4444-4444-8444-444444444442',
  [combinedActionKey]: '44444444-4444-4444-8444-444444444443' }
const policyFor = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id).vars)
const client = { supportsParts: true, partKinds: ['choice', 'question'], locale: 'en' }

// Producer shapes (orbit-api 2f49ed78f): a lone bulk tool holds its own operation; a bulk delete and a bulk rename in one
// turn become one applyAccountChanges operation whose item ids carry the member index in tool-call order.
function item(entityId, action, title, member) {
  const field = action === 'deleted'
    ? { entityId, entityName: 'Water - 710ml', field: 'delete', oldValue: null, newValue: null, valueType: 'action', proposedValue: null, isEditable: false }
    : { entityId, entityName: 'Water - 710ml', field: 'title', oldValue: 'Water - 710ml', newValue: title, valueType: 'text', proposedValue: title, isEditable: true }
  return { itemId: member === undefined ? entityId : `${member}/${entityId}`, entityId, entityName: 'Water - 710ml',
    stateFingerprint: 'state', removesData: action === 'deleted', fields: [field] }
}

function operations({ deleted, renamed, title, separate, renameFirst }) {
  const members = [['deleted', deleted], ['renamed', renamed]].filter(([, targets]) => targets.length)
  if (renameFirst) members.reverse()
  if (members.length === 2 && !separate) {
    return [{ ...preview(), id: operationIds[combinedActionKey], capabilityId: 'chat.changes', actionKey: combinedActionKey,
      displayName: 'Account changes', summary: 'Review account changes',
      items: members.flatMap(([action, targets], member) => targets.map((id) => item(id, action, title, member))) }]
  }
  return members.map(([action, targets]) => {
    const actionKey = action === 'deleted' ? 'deleteHabits' : 'updateHabits'
    return { ...preview(), id: operationIds[actionKey], actionKey, displayName: action === 'deleted' ? 'bulk_delete_habits' : 'bulk_update_habits',
      items: targets.map((id) => item(id, action, title)) }
  })
}

const respond = (calls, fields, requestId = 'same-title') => parseResponse({ ...chatResponse(requestId, calls), aiMessage: '', parts: [], ...fields }, '',
  { response: { status: 200, headers: { 'x-orbit-request-id': requestId } } })

function held({ deleted = [], renamed = [], title = 'Water - 1.18L', requestId = 'same-title', separate = false, renameFirst = false } = {}) {
  const calls = []
  if (deleted.length) calls.push(toolCall('bulk_delete_habits', { habit_ids: deleted }, 'PendingConfirmation', 'delete', { supportsParts: true }, true))
  if (renamed.length) calls.push(toolCall('bulk_update_habits', { filter: { habit_ids: renamed }, updates: { title } }, 'PendingConfirmation', 'rename', { supportsParts: true }, true))
  return respond(calls, { pendingOperations: operations({ deleted, renamed, title, separate, renameFirst }) }, requestId)
}

const persisted = (deleted, renamed, title = 'Water - 1.18L', source = baseline) => ({
  parent,
  children: source.children.filter((child) => !deleted.includes(child.id))
    .map((child) => ({ ...child, title: renamed.includes(child.id) ? title : child.title })),
})
const withReadback = (output, deleted, renamed, title, source = baseline) => ({ ...output,
  sameTitleReadback: { held: structuredClone(source), after: persisted(deleted, renamed, title, source) } })

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const classes = ['split', 'subset', 'whole', 'parent-match', 'choice-answer', 'typed-answer', 'typed-repeat', 'count-differs', 'singular',
  'delete-all', 'rename-last', 'conversation', 'card']
it.each(['en', 'pt'])('covers every #2127 and #2129 request class in %s with one fixture', (suffix) => {
  expect(classes.map((name) => family.find((entry) => entry.metadata.id === `same-title-${name}-${suffix}`)?.metadata.fixture))
    .toEqual(classes.map(() => 'same-title-children'))
  const localeControls = controls.filter((entry) => entry.metadata.id.endsWith(`-${suffix}`))
  expect(localeControls.map((entry) => entry.metadata.id)).toEqual([`same-title-control-thanks-${suffix}`, `same-title-control-order-${suffix}`])
  // Selection.cs GroupIsSettled returns early for a title group of one record, so a control needs the same-titled set.
  expect(localeControls.map((entry) => [entry.metadata.fixture, entry.vars.sameTitleSet])).toEqual(Array(2).fill(['same-title-children', {}]))
})

it('keeps the production requests word for word and states each locale once', () => {
  const production = 'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L'
  expect(['same-title-split-pt', 'same-title-card-pt'].map((id) => policyFor(id).input)).toEqual([production, production])
  const conversation = policyFor('same-title-conversation-pt')
  expect(conversation.history[0].content).toBe(production)
  expect(conversation.input).toBe('???? caralho cara, eu pedi uma coisa muito simples 2 ultimos habitos vc deleta 4 primeiros habitos chamados water 710ml vc muda pra Water - 1.18L qual a dificuldade?')
  expect(['same-title-delete-all-en', 'same-title-rename-last-en', 'same-title-delete-all-pt', 'same-title-rename-last-pt'].map((id) => policyFor(id).input))
    .toEqual(['Delete all my Water - 710ml habits.', 'Rename the last 2 Water - 710ml habits to Water - 1L.',
      'Apaga todos os meus hábitos Water - 710ml.', 'Renomeia os 2 últimos Water - 710ml para Water - 1L.'])
  for (const entry of [...family, ...controls]) {
    expect(entry.metadata.locale).toBe(entry.metadata.id.endsWith('-pt') ? 'pt-BR' : 'en')
    expect(entry.vars.rubric).toContain(entry.metadata.locale === 'pt-BR' ? 'Brazilian Portuguese' : 'English')
  }
})

it('expects one preview, asks no question before it unless an answer is declared, and asks once for singular requests', () => {
  for (const entry of family.filter((item) => item.vars.composition.mode === 'preview')) {
    expect(entry.vars.composition.previews, entry.metadata.id).toBe(1)
    if (entry.vars.composition.allowQuestion) {
      const { answer } = entry.vars.sameTitleSet
      expect(entry.vars.expectations.allowed).toContain('ask')
      expect([...answer.deleted, ...answer.renamed].toSorted()).toEqual([0, 1, 2, 3, 4, 5])
      expect([answer.deleted.length, answer.renamed.length]).toEqual([entry.vars.sameTitleSet.deleted.count, entry.vars.sameTitleSet.renamed.count])
      continue
    }
    expect(entry.vars.expectations.forbidden).toContain('ask')
    expect(entry.vars.expectations.allowed).not.toContain('ask')
  }
  for (const entry of [...family.filter((item) => item.vars.composition.mode === 'clarification'), ...controls]) {
    expect(entry.vars.expectations.allowed).toEqual(['query_habits', 'ask'])
    expect(entry.vars.rubric).toContain('exactly once')
  }
  expect(family.filter((entry) => entry.vars.history).map((entry) => entry.vars.history.at(-1).role)).toEqual(Array(8).fill('assistant'))
})

it('lets only the count and card cases carry one preview note', () => {
  expect(family.filter((entry) => entry.vars.composition.allowPreviewNote).map((entry) => entry.metadata.id))
    .toEqual(['same-title-split-en', 'same-title-count-differs-en', 'same-title-card-en', 'same-title-split-pt', 'same-title-count-differs-pt', 'same-title-card-pt'])
})

it('grades the one combined preview the API held for the real split request', () => {
  const output = respond([], { pendingOperations: streams.run3.answer.pendingOperations })
  const vars = { ...policyFor('same-title-split-pt'), sameTitleBaseline: baselineOf(streams.run3.children) }
  expect(sameTitleProposal(output, vars)).toMatchObject({ pass: true })
  const [deleted, renamed] = [streams.run3.children.slice(0, 2), streams.run3.children.slice(2)]
  expect(sameTitleReadback(withReadback(output, deleted, renamed, 'Water - 1.18L', vars.sameTitleBaseline), vars)).toMatchObject({ pass: true })
  expect(sameTitleReadback(withReadback(output, [], renamed, 'Water - 1.18L', vars.sameTitleBaseline), vars)).toMatchObject({ pass: false })
  // Run 3 answered "Últimos quatro", so the preview deletes the first two; the ordered answer case expects the last two.
  expect(sameTitleProposal(output, { ...policyFor('same-title-choice-answer-pt'), sameTitleBaseline: vars.sameTitleBaseline }))
    .toMatchObject({ pass: false, reason: 'The held preview does not delete exactly the requested habits.' })
})

it('fails the real preview that held the renames and lost the deletion', () => {
  const output = respond([], { pendingOperations: streams.run5.answer.pendingOperations })
  const vars = { ...policyFor('same-title-split-pt'), sameTitleBaseline: baselineOf(streams.run5.children) }
  expect(sameTitleProposal(output, vars)).toMatchObject({ pass: false, reason: 'Expected one held applyAccountChanges preview, found updateHabits.' })
})

it('accepts a split preview over any two and four children and the ordered split by position', () => {
  const split = policyFor('same-title-split-en')
  const output = held({ deleted: [ids[1], ids[3]], renamed: [ids[0], ids[2], ids[4], ids[5]] })
  expect(sameTitleProposal(output, { ...split, sameTitleBaseline: baseline })).toMatchObject({ pass: true })
  const ordered = { ...policyFor('same-title-choice-answer-en'), sameTitleBaseline: baseline }
  expect(sameTitleProposal(output, ordered).pass).toBe(false)
  expect(sameTitleProposal(held({ deleted: ids.slice(4), renamed: ids.slice(0, 4) }), ordered).pass).toBe(true)
  expect(sameTitleProposal(held({ deleted: ids.slice(4), renamed: ids.slice(0, 4), renameFirst: true }), ordered).pass).toBe(true)
})

it.each([
  ['two separate held operations', held({ deleted: ids.slice(4), renamed: ids.slice(0, 4), separate: true }), 'Expected one held preview, found 2.'],
  ['a missing rename', held({ deleted: ids.slice(4) }), 'Expected one held applyAccountChanges preview, found deleteHabits.'],
  ['a missing deletion', held({ renamed: ids.slice(0, 4) }), 'Expected one held applyAccountChanges preview, found updateHabits.'],
  ['too few deletions', held({ deleted: ids.slice(5), renamed: ids.slice(0, 4) }), 'The held preview does not delete exactly the requested habits.'],
  ['a habit in both actions', held({ deleted: ids.slice(3, 5), renamed: ids.slice(0, 4) }), 'A held item repeats a habit or targets something other than a stored same-title child.'],
  ['the parent as a target', held({ deleted: [ids[4], parent.id], renamed: ids.slice(0, 4) }), 'A held item repeats a habit or targets something other than a stored same-title child.'],
  ['an unknown habit', held({ deleted: ids.slice(4), renamed: [...ids.slice(0, 3), '55555555-5555-4555-8555-555555555555'] }), 'A held item repeats a habit or targets something other than a stored same-title child.'],
  ['another title', held({ deleted: ids.slice(4), renamed: ids.slice(0, 4), title: 'Water - 1L' }), 'A held item is neither a deletion nor a rename to the requested title.'],
  ['no preview', held(), 'Expected one held preview, found 0.'],
])('rejects the split when it has %s', (_name, output, reason) => {
  expect(sameTitleProposal(output, { ...policyFor('same-title-split-en'), sameTitleBaseline: baseline })).toMatchObject({ pass: false, reason })
})

it('rejects a combined preview whose member mixes a deletion and a rename', () => {
  const output = held({ deleted: ids.slice(4), renamed: ids.slice(0, 4) })
  output.composition.pendingOperations[0].items[0].itemId = `1/${ids[4]}`
  expect(sameTitleProposal(output, { ...policyFor('same-title-split-en'), sameTitleBaseline: baseline }))
    .toMatchObject({ pass: false, reason: 'Each requested action must be one member of the held preview.' })
})

it.each(['same-title-singular-en', 'same-title-control-thanks-en', 'same-title-control-order-pt'])('accepts %s only without a held operation', (id) => {
  const policy = { ...policyFor(id), sameTitleBaseline: baseline }
  expect(sameTitleProposal(held(), policy).pass).toBe(true)
  expect(sameTitleProposal(held({ renamed: ids.slice(0, 1) }), policy).pass).toBe(false)
  expect(sameTitleReadback(withReadback(held(), [], []), policy).pass).toBe(true)
  expect(sameTitleReadback(withReadback(held(), [], ids.slice(0, 1)), policy).pass).toBe(false)
})

it('requires persisted evidence that matches the approved deletions and renames', () => {
  const policy = { ...policyFor('same-title-split-en'), sameTitleBaseline: baseline }
  const deleted = ids.slice(4)
  const renamed = ids.slice(0, 4)
  const output = held({ deleted, renamed })
  expect(sameTitleReadback(output, policy).pass).toBe(false)
  expect(sameTitleReadback(withReadback(output, deleted, renamed), policy).pass).toBe(true)
  const broken = [
    ['a held preview that changed a habit', (copy) => { copy.sameTitleReadback.held.children[0].title = 'Changed' }],
    ['a renamed parent', (copy) => { copy.sameTitleReadback.after.parent.title = 'Water - 1.18L' }],
    ['a deleted child that remains', (copy) => { copy.sameTitleReadback.after.children.push(baseline.children[5]) }],
    ['a rename that never landed', (copy) => { copy.sameTitleReadback.after.children[0].title = 'Water - 710ml' }],
    ['a child lost without approval', (copy) => { copy.sameTitleReadback.after.children.shift() }],
  ]
  for (const [name, change] of broken) {
    const copy = structuredClone(withReadback(output, deleted, renamed))
    change(copy)
    expect(sameTitleReadback(copy, policy).pass, name).toBe(false)
  }
})

const positionsOf = (action, fromEnd) => action.positions ?? Array.from({ length: action.count }, (_, index) => fromEnd ? 6 - action.count + index : index)
it('connects both graders to the production behavior assertion for every preview case', () => {
  for (const entry of family.filter((item) => item.vars.composition.mode === 'preview')) {
    const { deleted, renamed } = entry.vars.sameTitleSet
    const deletedIds = deleted ? positionsOf(deleted, true).map((position) => ids[position]) : []
    const renamedIds = renamed ? positionsOf(renamed, false).map((position) => ids[position]) : []
    const output = held({ deleted: deletedIds, renamed: renamedIds, title: renamed?.title })
    const context = { vars: { ...entry.vars, evalRequestId: 'same-title', sameTitleBaseline: baseline } }
    expect(behavior(output, context).pass, entry.metadata.id).toBe(false)
    expect(behavior(withReadback(output, deletedIds, renamedIds, renamed?.title), context).pass, entry.metadata.id).toBe(true)
  }
})

// Real first-turn cards of the 13 November 2026 staging runs. A set option covers only the ids its ask call declares.
const cardVars = (children, locale = 'pt-BR') => ({ ...policyFor(locale === 'en' ? 'same-title-card-en' : 'same-title-card-pt'),
  sameTitleBaseline: baselineOf(children), clientContext: { ...client, locale } })
const askTrace = (targets) => ({ calls: [{ id: 'ask', name: 'ask', resultStatus: 'Succeeded',
  arguments: { input: { form: 'choice', options: Object.entries(targets).map(([id, target_ids]) => ({ id, label: id, description: null, target_ids })) } } }] })
const shown = (card, trace = { calls: [] }) => ({ composition: { parts: [card] }, trace })
const run2Options = streams.run2.card.block.questions[0].options.map((option) => option.id)
const unstored = '9b610c68-0080-417a-80b1-a3f9c3fbc810'
const syntheticChildren = Array.from({ length: 6 }, (_, index) => `66666666-6666-4666-8666-66666666666${index}`)

it.each([
  ['run 2 names a record that is not a stored child', shown(streams.run2.card), [...run2Options.filter((id) => id !== unstored), syntheticChildren[5]],
    'A card option names a record that is not a stored same-title child.'],
  ['run 2 takes one record for a question about two', shown(streams.run2.card), run2Options, 'No selection the card allows states the whole decision.'],
  ['run 4 offers four of six records', shown(streams.run4.card, askTrace(Object.fromEntries(['habit1', 'habit2', 'habit3', 'habit4']
    .map((id, index) => [id, [syntheticChildren[index]]])))), syntheticChildren, 'The card lets the person select 4 of the 6 same-title children.'],
  ['run 4 without declared targets', shown(streams.run4.card), syntheticChildren, 'The card lets the person select 0 of the 6 same-title children.'],
  ['run 5 leaves the middle two unselectable', shown(streams.run5.card, askTrace({ first: streams.run5.children.slice(0, 2), last: streams.run5.children.slice(4) })),
    streams.run5.children, 'The card lets the person select 4 of the 6 same-title children.'],
  ['run 3 without declared targets', shown(streams.run3.card), streams.run3.children, 'The card lets the person select 0 of the 6 same-title children.'],
])('fails a card that cannot hold the answer: %s', (_name, output, children, reason) => {
  expect(sameTitleCard(output, cardVars(children))).toMatchObject({ pass: false, reason })
})

// The real client submission: the card's controller hands its labels and answer to BlockAnswerSubmission.send, whose
// request is the message and blockAnswer the chat endpoint receives.
async function clientAnswer(part, selected, locale) {
  let posted
  const chat = { isTyping: false, streamingMessageId: null, messages: [] }
  const submission = new BlockAnswerSubmission()
  const context = { isOnline: true, atMessageLimit: false, locale, getChat: () => chat, createMessageId: () => 'answer', beginSend() {},
    conversation: { astraConversationOpen: true }, refreshProfile: async () => {}, words: { answered: String },
    run: async (request) => { posted = request; return { kind: 'final' } } }
  const interaction = { isOnline: true, isSending: false, atMessageLimit: false, allowance: 1, send: (request) => submission.send(request, context) }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T05:00:00Z'))
  try {
    if (part.kind === 'choice') {
      const controller = new AnswerBlockController({ definition: part })
      for (const id of selected) controller.check(id, true)
      await controller.submit({ definition: part, interaction }, String, locale)
    } else {
      const controller = new QuestionBlockController()
      for (const question of part.block.questions) for (const id of selected[question.id] ?? []) controller.select(question, id)
      await controller.submit({ block: part.block, interaction }, { yes: 'Yes', no: 'No', answered: String }, locale)
    }
  } finally { vi.useRealTimers() }
  return { message: posted.content, blockAnswer: posted.blockAnswer }
}
const sentBy = ({ message, blockAnswer }) => ({ message, blockAnswer })

it('answers a card that can hold the decision with the message and selection the client sends', async () => {
  const children = streams.run3.children
  const run3 = sameTitleCard(shown(streams.run3.card, askTrace({ setA: children.slice(0, 4), setB: children.slice(2), all6: children })), cardVars(children))
  const run3Sent = await clientAnswer(streams.run3.card, ['setA'], 'pt-BR')
  expect(run3Sent.message).toBe('Primeiros quatro')
  expect(run3.pass).toBe(true)
  expect(sentBy(run3)).toEqual(run3Sent)
  const records = (prompt) => ({ type: 'block', kind: 'question', block: { blockId: '77777777-7777-4777-8777-777777777777', questions: [{ id: 'pick',
    type: 'multipleChoice', prompt, allowFreeText: false, options: ids.map((id, index) => ({ id, label: `${index + 1}º` })) }] } })
  const deleteCard = records('Quais dois você quer excluir?')
  const deleteSent = await clientAnswer(deleteCard, { pick: ids.slice(4) }, 'pt-BR')
  expect(deleteSent.message).toBe('Quais dois você quer excluir?: 5º e 6º')
  const deletion = sameTitleCard(shown(deleteCard), cardVars(ids))
  expect(deletion.pass).toBe(true)
  expect(sentBy(deletion)).toEqual(deleteSent)
  const keepCard = records('Which four do you want to keep?')
  const keepSent = await clientAnswer(keepCard, { pick: ids.slice(0, 4) }, 'en')
  expect(keepSent.message).toBe('Which four do you want to keep?: 1º, 2º, 3º, and 4º')
  const keep = sameTitleCard(shown(keepCard), cardVars(ids, 'en'))
  expect(keep.pass).toBe(true)
  expect(sentBy(keep)).toEqual(keepSent)
  expect(sameTitleCard({ composition: { parts: [{ type: 'text', text: 'Which two should I delete?' }] }, trace: { calls: [] } }, cardVars(ids, 'en')))
    .toEqual(expect.objectContaining({ pass: true, message: 'Delete the last 2 and rename the first 4' }))
})

const questionCard = (children, prompt) => ({ type: 'block', kind: 'question', block: { blockId: '77777777-7777-4777-8777-777777777777',
  expiresAtUtc: '2026-11-14T04:33:04Z', questions: [{ id: 'pick', type: 'multipleChoice', prompt, allowFreeText: false,
    options: children.map((id, index) => ({ id, label: `${index + 1}st` })) }] } })

it('lets a card case show one question and keeps every other preview case strict', () => {
  const card = questionCard(ids, 'Which two do you want to delete?')
  const context = (id) => ({ vars: { ...policyFor(id), clientContext: client } })
  expect(composition(respond([], { parts: [card] }), context('same-title-card-en'))).toMatchObject({ pass: true })
  expect(composition(respond([], { parts: [card] }), context('same-title-split-en'))).toMatchObject({ pass: false, reason: 'Missing batch preview.' })
  expect(composition(respond([], { parts: [card, card] }), context('same-title-card-en')).pass).toBe(false)
  const text = 'Which two of the six should I delete?'
  expect(composition(respond([], { aiMessage: text, parts: [{ type: 'text', text }] }), context('same-title-card-en')).pass).toBe(true)
  expect(composition(held({ deleted: ids.slice(4), renamed: ids.slice(0, 4) }), context('same-title-card-en')).pass).toBe(true)
})

let habits, requests, pendingTargets
function boundary(failure) {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  habits = []
  requests = []
  const fixture = fixtureFetch(() => ({ habits, goals: [], tags: [], templates: [], requests, pro: true, exhausted: false, capacity: 100,
    email: 'thomaslrgregorio+orbit-eval-pro@gmail.com', unmetered: true }))
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (!path.startsWith('/api/ai/')) return fixture(url, options)
    requests.push({ path, body: options.body ? JSON.parse(options.body) : undefined })
    if (path.endsWith('/confirm')) return Response.json({ pendingOperationId: failure === 'unbound' ? operationIds.deleteHabits : path.split('/')[4],
      confirmationToken: 'private-confirmation-token' })
    if (failure !== 'ignored') {
      for (const habit of habits) {
        if (pendingTargets.deleted.includes(habit.id)) habit.deleted = true
        if (pendingTargets.renamed.includes(habit.id)) habit.title = 'Water - 1.18L'
      }
    }
    return Response.json({ operation: {}, pendingOperation: null, policyDenial: null })
  })
}

async function seeded(entryId) {
  const test = { metadata: { locale: 'en', fixture: 'same-title-children' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  await resetFixture(test)
  vi.useRealTimers()
  return { ...policyFor(entryId), ...test.vars, evalRequestId: 'same-title', clientContext: client }
}

it('seeds one parent with six ordered same-title children and keeps both registered roots', async () => {
  boundary()
  const policy = await seeded('same-title-split-en')
  const active = habits.filter((habit) => !habit.deleted)
  expect(active).toHaveLength(8)
  expect(active.filter((habit) => !habit.parentHabitId).map((habit) => habit.title).toSorted()).toEqual(['Walk', 'Water'])
  expect(policy.sameTitleBaseline.parent.title).toBe(sameTitleSet.parent)
  expect(policy.sameTitleBaseline.children.map(({ title, position }) => ({ title, position })))
    .toEqual(Array.from({ length: 6 }, (_, position) => ({ title: sameTitleSet.child, position })))
  expect(active.filter((habit) => habit.parentHabitId === policy.sameTitleBaseline.parent.id)).toHaveLength(6)
  expect(policy.fixtureEvidence.habits).toHaveLength(8)
  expect(requests.filter(({ method, path }) => method === 'DELETE' && path.startsWith('habits/'))).toEqual([])
  expect(requests.some(({ path }) => path.startsWith('chat') || path.startsWith('/api/ai/'))).toBe(false)
})

const aiWrites = () => requests.filter(({ path }) => path.startsWith('/api/ai/')).map(({ path }) => path.split('/').at(-1))

it.each(['approve', 'ignored'])('runs the split preview through the HTTP provider with %s', async (failure) => {
  boundary(failure)
  const policy = await seeded('same-title-split-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  pendingTargets = { deleted: children.slice(4), renamed: children.slice(0, 4) }
  requests.length = 0
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => ({ output: held({ deleted: children.slice(4), renamed: children.slice(0, 4) }) }) })
  const response = await provider.callApi('split', { vars: policy })
  expect(response.error).toBeUndefined()
  expect(sameTitleReadback(response.output, policy).pass).toBe(failure === 'approve')
  expect(aiWrites()).toEqual(['confirm', 'execute'])
  expect(requests.find(({ path }) => path.endsWith('/execute')).path).toContain(operationIds[combinedActionKey])
  expect(JSON.stringify(response)).not.toContain('private-confirmation-token')
  if (failure === 'approve') expect(await readSameTitleSet(publicApi('ORBIT_EVAL_TOKEN'), policy.sameTitleBaseline.parent.id))
    .toEqual({ parent: policy.sameTitleBaseline.parent, children: expect.arrayContaining([expect.objectContaining({ title: 'Water - 1.18L' })]) })
})

it('never executes a confirmation bound to another pending operation', async () => {
  boundary('unbound')
  const policy = await seeded('same-title-split-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  pendingTargets = { deleted: children.slice(4), renamed: children.slice(0, 4) }
  requests.length = 0
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => ({ output: held({ deleted: children.slice(4), renamed: children.slice(0, 4) }) }) })
  const response = await provider.callApi('split', { vars: policy })
  expect(response.error).toBe('Same-title approval or independent persisted readback failed.')
  expect(aiWrites()).toEqual(['confirm'])
  expect(habits.filter((habit) => habit.deleted || habit.title === 'Water - 1.18L')).toHaveLength(0)
})

it('keeps chat() to one request that approves nothing, so an answer turn cannot start the same-title lifecycle', async () => {
  boundary()
  const policy = await seeded('same-title-split-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  pendingTargets = { deleted: children.slice(4), renamed: children.slice(0, 4) }
  requests.length = 0
  let calls = 0
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => {
    calls++
    return { output: held({ deleted: children.slice(4), renamed: children.slice(0, 4) }) }
  } })
  const response = await provider.chat('split', { vars: policy })
  expect(response.error).toBeUndefined()
  expect(calls).toBe(1)
  expect(response.output.sameTitleReadback).toBeUndefined()
  expect(aiWrites()).toEqual([])
})

it('never approves malformed tool evidence or a preview with the wrong targets', async () => {
  boundary()
  const policy = await seeded('same-title-split-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  requests.length = 0
  const malformed = held({ deleted: children.slice(4), renamed: children.slice(0, 4) })
  malformed.trace.responseRequestId = 'other-request'
  await completeSameTitleSet(malformed, policy)
  await completeSameTitleSet(held({ deleted: children.slice(5), renamed: children.slice(0, 4) }), policy)
  expect(requests).toHaveLength(0)
})

async function cardAttempt(firstTurn, answerTurn) {
  const policy = await seeded('same-title-card-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  pendingTargets = { deleted: children.slice(4), renamed: children.slice(0, 4) }
  requests.length = 0
  const answered = []
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => ({ output: firstTurn(children) }) })
  provider.answerProvider = Promise.resolve({ callApi: async (prompt, { vars }) => {
    answered.push({ prompt, vars })
    return { output: answerTurn(children, vars.evalRequestId) }
  } })
  return { policy, children, answered, response: await provider.callApi(policy.input, { vars: policy }) }
}

it('answers a card that holds the decision, then approves the one preview of the answer turn', async () => {
  boundary()
  const { policy, children, answered, response } = await cardAttempt((children) => respond([], { parts: [questionCard(children, 'Which two do you want to delete?')] }),
    (children, requestId) => held({ deleted: children.slice(4), renamed: children.slice(0, 4), requestId }))
  expect(response.error).toBeUndefined()
  expect(answered).toHaveLength(1)
  const sent = await clientAnswer(questionCard(children, 'Which two do you want to delete?'), { pick: children.slice(4) }, 'en')
  expect(sent.message).toBe('Which two do you want to delete?: 5st and 6st')
  expect(answered[0].prompt).toBe(sent.message)
  expect(JSON.parse(answered[0].vars.blockAnswerJson)).toEqual(sent.blockAnswer)
  // The answer turn keeps the case's vars: chat() is one request, so no var stops it from starting the lifecycle again.
  expect(answered[0].vars.sameTitleSet).toEqual(policy.sameTitleSet)
  expect(answered[0].vars.evalRequestId).not.toBe(policy.evalRequestId)
  expect(JSON.parse(answered[0].vars.historyJson)).toEqual([{ role: 'user', content: policy.input },
    { role: 'assistant', content: expect.stringContaining('"kind":"question"') }])
  expect(response.output.sameTitleAnswer.checks.map(({ metric, pass }) => [metric, pass]))
    .toEqual([['structural', true], ['behavior', true], ['composition', true]])
  expect(aiWrites()).toEqual(['confirm', 'execute'])
  expect(behavior(response.output, { vars: policy })).toMatchObject({ pass: true })
})

it.each([
  ['a card that cannot hold the answer', () => respond([], { parts: [{ ...streams.run5.card, block: { ...streams.run5.card.block, expiresAtUtc: '2026-11-14T04:43:10Z' } }] }),
    0, 'The card lets the person select 0 of the 6 same-title children.'],
  ['an answer turn that loses the deletion', (children) => respond([], { parts: [questionCard(children, 'Which two do you want to delete?')] }),
    1, 'The answer turn failed behavior: Missing tool or incorrect arguments/result: bulk_delete_habits'],
])('never approves %s', async (_name, firstTurn, answers, reason) => {
  boundary()
  const { policy, answered, response } = await cardAttempt(firstTurn, (children, requestId) => held({ renamed: children.slice(0, 4), requestId }))
  expect(response.error).toBeUndefined()
  expect(answered).toHaveLength(answers)
  expect(aiWrites()).toEqual([])
  expect(behavior(response.output, { vars: policy })).toMatchObject({ pass: false, reason })
})
