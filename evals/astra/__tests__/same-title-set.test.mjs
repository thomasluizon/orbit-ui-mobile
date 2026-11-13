import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import { sameTitleProposal, sameTitleReadback } from '../same-title-set.mjs'
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

const corpus = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const family = corpus.filter((entry) => entry.metadata.family === 'same-title-set')
const controls = corpus.filter((entry) => entry.metadata.family === 'same-title-control')
const ids = Array.from({ length: 6 }, (_, index) => `22222222-2222-4222-8222-22222222222${index}`)
const parent = { id: '33333333-3333-4333-8333-333333333333', title: 'Water' }
const baseline = { parent, children: ids.map((id, position) => ({ id, title: 'Water - 710ml', position })) }
const operationIds = { deleteHabits: '44444444-4444-4444-8444-444444444441', updateHabits: '44444444-4444-4444-8444-444444444442' }
const policyFor = (id) => structuredClone(family.find((entry) => entry.metadata.id === id).vars)

// Only the fields the composition check requires are modelled: a title change per item, new value null for a deletion.
function pendingOperation(actionKey, targets) {
  const newValue = actionKey === 'updateHabits' ? 'Water - 1.18L' : null
  return { ...preview(), id: operationIds[actionKey], actionKey, displayName: actionKey === 'deleteHabits' ? 'bulk_delete_habits' : 'bulk_update_habits',
    items: targets.map((entityId) => ({ itemId: entityId, entityId, entityName: 'Water - 710ml', stateFingerprint: 'state', removesData: null,
      fields: [{ entityId, entityName: 'Water - 710ml', field: 'title', oldValue: 'Water - 710ml', newValue, valueType: 'string', proposedValue: newValue, isEditable: false }] })) }
}

function held({ deleted = [], renamed = [], requestId = 'same-title' } = {}) {
  const calls = []
  const operations = []
  if (deleted.length) {
    calls.push(toolCall('bulk_delete_habits', { habit_ids: deleted }, 'PendingConfirmation', 'delete', { supportsParts: true }, true))
    operations.push(pendingOperation('deleteHabits', deleted))
  }
  if (renamed.length) {
    calls.push(toolCall('bulk_update_habits', { filter: { habit_ids: renamed }, updates: { title: 'Water - 1.18L' } }, 'PendingConfirmation', 'rename', { supportsParts: true }, true))
    operations.push(pendingOperation('updateHabits', renamed))
  }
  return parseResponse({ ...chatResponse(requestId, calls), aiMessage: '', parts: [], pendingOperations: operations }, '',
    { response: { status: 200, headers: { 'x-orbit-request-id': requestId } } })
}

const persisted = (deleted, renamed) => ({
  parent,
  children: baseline.children.filter((child) => !deleted.includes(child.id))
    .map((child) => ({ ...child, title: renamed.includes(child.id) ? 'Water - 1.18L' : child.title })),
})
const withReadback = (output, deleted, renamed) => ({ ...output, sameTitleReadback: { held: structuredClone(baseline), after: persisted(deleted, renamed) } })

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const classes = ['split', 'subset', 'whole', 'parent-match', 'choice-answer', 'typed-answer', 'typed-repeat', 'count-differs', 'singular']
it.each(['en', 'pt'])('covers every #2127 request class in %s with one fixture', (suffix) => {
  expect(classes.map((name) => family.find((entry) => entry.metadata.id === `same-title-${name}-${suffix}`)?.metadata.fixture))
    .toEqual(classes.map(() => 'same-title-children'))
  expect(controls.filter((entry) => entry.metadata.id.endsWith(`-${suffix}`)).map((entry) => entry.metadata.fixture)).toEqual(['similar-titles', 'similar-titles'])
})

it('keeps the production request word for word and states each locale once', () => {
  expect(family.find((entry) => entry.metadata.id === 'same-title-split-pt').vars.input)
    .toBe('eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L')
  for (const entry of [...family, ...controls]) {
    expect(entry.metadata.locale).toBe(entry.metadata.id.endsWith('-pt') ? 'pt-BR' : 'en')
    expect(entry.vars.rubric).toContain(entry.metadata.locale === 'pt-BR' ? 'Brazilian Portuguese' : 'English')
  }
})

it('asks no question before a preview and exactly one for the singular and control requests', () => {
  for (const entry of family.filter((item) => item.vars.composition.mode === 'preview')) {
    expect(entry.vars.expectations.forbidden).toContain('ask')
    expect(entry.vars.expectations.allowed).not.toContain('ask')
    expect(entry.vars.composition.previews).toBe(Object.keys(entry.vars.sameTitleSet).length)
  }
  for (const entry of [...family.filter((item) => item.vars.composition.mode === 'clarification'), ...controls]) {
    expect(entry.vars.expectations.allowed).toEqual(['query_habits', 'ask'])
    expect(entry.vars.rubric).toContain('exactly once')
  }
  expect(family.filter((entry) => entry.vars.history).map((entry) => entry.vars.history.at(-1).role)).toEqual(Array(6).fill('assistant'))
})

it('lets only the two count cases carry one preview note', () => {
  expect(family.filter((entry) => entry.vars.composition.allowPreviewNote).map((entry) => entry.metadata.id))
    .toEqual(['same-title-split-en', 'same-title-count-differs-en', 'same-title-split-pt', 'same-title-count-differs-pt'])
})

it('accepts a split preview over any two and four children and the ordered split by position', () => {
  const split = policyFor('same-title-split-en')
  const output = held({ deleted: [ids[1], ids[3]], renamed: [ids[0], ids[2], ids[4], ids[5]] })
  expect(sameTitleProposal(output, { ...split, sameTitleBaseline: baseline }).pass).toBe(true)
  const ordered = policyFor('same-title-choice-answer-en')
  expect(sameTitleProposal(output, { ...ordered, sameTitleBaseline: baseline }).pass).toBe(false)
  expect(sameTitleProposal(held({ deleted: ids.slice(4), renamed: ids.slice(0, 4) }), { ...ordered, sameTitleBaseline: baseline }).pass).toBe(true)
})

it.each([
  ['a missing rename', held({ deleted: ids.slice(4) })],
  ['a missing deletion', held({ renamed: ids.slice(0, 4) })],
  ['too few deletions', held({ deleted: ids.slice(5), renamed: ids.slice(0, 4) })],
  ['a habit in both actions', held({ deleted: ids.slice(3, 5), renamed: ids.slice(0, 4) })],
  ['the parent as a target', held({ deleted: [ids[4], parent.id], renamed: ids.slice(0, 4) })],
  ['an unknown habit', held({ deleted: ids.slice(4), renamed: [...ids.slice(0, 3), '55555555-5555-4555-8555-555555555555'] })],
  ['no preview', held()],
])('rejects the split when it has %s', (_name, output) => {
  expect(sameTitleProposal(output, { ...policyFor('same-title-split-en'), sameTitleBaseline: baseline }).pass).toBe(false)
})

it('accepts the singular request only without a held operation', () => {
  const policy = { ...policyFor('same-title-singular-en'), sameTitleBaseline: baseline }
  expect(sameTitleProposal(held(), policy).pass).toBe(true)
  expect(sameTitleProposal(held({ renamed: ids.slice(0, 1) }), policy).pass).toBe(false)
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

it('connects both graders to the production behavior assertion for every preview case', () => {
  for (const entry of family.filter((item) => item.vars.composition.mode === 'preview')) {
    const { deleted, renamed } = entry.vars.sameTitleSet
    const deletedIds = deleted ? (deleted.positions ?? [4, 5]).map((position) => ids[position]) : []
    const renamedIds = renamed ? (renamed.positions ?? (renamed.count === 6 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3])).map((position) => ids[position]) : []
    const output = held({ deleted: deletedIds, renamed: renamedIds })
    const context = { vars: { ...entry.vars, evalRequestId: 'same-title', sameTitleBaseline: baseline } }
    expect(behavior(output, context).pass, entry.metadata.id).toBe(false)
    expect(behavior(withReadback(output, deletedIds, renamedIds), context).pass, entry.metadata.id).toBe(true)
  }
})

let habits, requests
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
    if (path.endsWith('/confirm')) return Response.json({ confirmationToken: 'private-confirmation-token' })
    const operation = Object.entries(operationIds).find(([, id]) => path.includes(id))[0]
    if (failure !== 'ignored') {
      const targets = pendingTargets[operation]
      for (const habit of habits.filter((entry) => targets.includes(entry.id))) {
        if (operation === 'deleteHabits') habit.deleted = true
        else habit.title = 'Water - 1.18L'
      }
    }
    return Response.json({ operation: {}, pendingOperation: null, policyDenial: null })
  })
}
let pendingTargets

async function seeded(entryId) {
  const test = { metadata: { locale: 'en', fixture: 'same-title-children' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  await resetFixture(test)
  vi.useRealTimers()
  const policy = { ...policyFor(entryId), ...test.vars, evalRequestId: 'same-title', clientContext: { supportsParts: true, partKinds: [] } }
  return policy
}

it('seeds one parent with six ordered same-title children and no second root', async () => {
  boundary()
  const policy = await seeded('same-title-split-en')
  const active = habits.filter((habit) => !habit.deleted)
  expect(active).toHaveLength(7)
  expect(policy.sameTitleBaseline.parent.title).toBe(sameTitleSet.parent)
  expect(policy.sameTitleBaseline.children.map(({ title, position }) => ({ title, position })))
    .toEqual(Array.from({ length: 6 }, (_, position) => ({ title: sameTitleSet.child, position })))
  expect(active.filter((habit) => habit.parentHabitId === policy.sameTitleBaseline.parent.id)).toHaveLength(6)
  expect(policy.fixtureEvidence.habits).toHaveLength(7)
  expect(requests.some(({ path }) => path.startsWith('chat') || path.startsWith('ai/'))).toBe(false)
})

it.each(['approve', 'ignored'])('runs the split through the HTTP provider with %s', async (failure) => {
  boundary(failure)
  const policy = await seeded('same-title-split-en')
  const children = policy.sameTitleBaseline.children.map((child) => child.id)
  pendingTargets = { deleteHabits: children.slice(4), updateHabits: children.slice(0, 4) }
  requests.length = 0
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => ({ output: held({ deleted: children.slice(4), renamed: children.slice(0, 4) }) }) })
  const response = await provider.callApi('split', { vars: policy })
  expect(response.error).toBeUndefined()
  expect(sameTitleReadback(response.output, policy).pass).toBe(failure === 'approve')
  const writes = requests.filter(({ path }) => path.startsWith('/api/ai/'))
  expect(writes.map(({ path }) => path.split('/').at(-1))).toEqual(['confirm', 'execute', 'confirm', 'execute'])
  expect(JSON.stringify(response)).not.toContain('private-confirmation-token')
  if (failure === 'approve') expect(await readSameTitleSet(publicApi('ORBIT_EVAL_TOKEN'), policy.sameTitleBaseline.parent.id))
    .toEqual({ parent: policy.sameTitleBaseline.parent, children: expect.arrayContaining([expect.objectContaining({ title: 'Water - 1.18L' })]) })
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
