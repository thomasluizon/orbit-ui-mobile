import { expect, it } from 'vitest'
import { checkSuppression, checkReadScopes, checkPreviewRejection, checkActionLifecycle } from '../offer-lifecycle.mjs'
import { preview } from './fixtures/producer.mjs'

const baseline = () => ({ habits: [], goals: [], tags: [], checklistTemplates: [] })
const today = '2031-06-10'
const habitId = '22222222-2222-4222-8222-222222222222'
const issued = { offerKey: `smallStep:account:${today}`, kind: 'continueChat', label: 'Choose one small step',
  surface: null, prompt: 'Help me choose one small step I can take today.', entityId: null, date: today }
const varsFor = () => ({ accountDate: today, clientContext: { platform: 'web', locale: 'en', conversationId: habitId },
  issuedOffer: { action: issued }, offerBaseline: baseline(), setup: { input: 'Show my day.' } })
const answer = (action) => ({ composition: { parts: [{ type: 'block', kind: 'habitList', block: {
  scope: 'today', items: [], read: { nextAction: action },
} }] } })

it.each(['valid', 'repeated', 'different-missing', 'write'])('checks eleven turns, reload, another device and a different offer: %s', async (fault) => {
  const vars = varsFor()
  let count = 0
  let seeded = false
  const calls = []
  const api = async (method, path) => {
    if (path === `habits/${habitId}`) return { payload: { id: habitId, title: 'Breathe' } }
    if (method === 'POST' && path === 'habits') { seeded = true; return { payload: { id: habitId } } }
    return { payload: { ...baseline(), habits: seeded ? [{ id: habitId, title: 'Breathe' }]
      : fault === 'write' ? [{ id: 'unapproved' }] : [] } }
  }
  const turn = async (_input, _policy, client, reload) => {
    count++
    calls.push({ client, reload })
    if (fault === 'repeated' && count === 12) return answer(issued)
    return answer(count === 14 && fault !== 'different-missing'
      ? { ...issued, offerKey: `log:${habitId}:${today}`, entityId: habitId } : undefined)
  }
  const promise = checkSuppression(api, vars, turn)
  if (fault !== 'valid') await expect(promise).rejects.toThrow()
  else {
    await promise
    expect(count).toBe(14)
    expect(calls[11]).toMatchObject({ reload: true, client: { platform: 'web', conversationId: habitId } })
    expect(calls[12]).toMatchObject({ reload: true, client: { platform: 'mobile', conversationId: habitId } })
  }
})

it.each(['valid', 'historical-log', 'partial-offer', 'write'])('replays historical and partial scopes: %s', async (fault) => {
  let calls = 0
  const turn = async (_input, policy) => {
    calls++
    expect(policy.expectations.required[0].name).toBe('query_habits')
    return answer(fault === 'historical-log' && calls === 1 ? { ...issued, offerKey: `log:${habitId}:${today}` }
      : fault === 'partial-offer' && calls === 2 ? issued : undefined)
  }
  const api = async () => ({ payload: fault === 'write' ? { ...baseline(), goals: [{ id: 'unapproved' }] } : baseline() })
  const promise = checkReadScopes(api, varsFor(), turn)
  if (fault === 'valid') { await promise; expect(calls).toBe(2) }
  else await expect(promise).rejects.toThrow()
})

function reminderPreview() {
  const pending = preview('Drink water')
  pending.items[0].fields = [
    { ...pending.items[0].fields[0], field: 'title', newValue: 'Drink water', proposedValue: 'Drink water', provenance: 'requested' },
    { ...pending.items[0].fields[0], field: 'repeat_reminder', proposedValue: { interval_minutes: 120 }, provenance: 'suggested',
      removal: { offerKey: 'preview:repeat_reminder', field: 'repeat_reminder', fields: ['repeat_reminder'] } },
  ]
  return pending
}

it.each(['valid', 'resurrected', 'title-lost', 'different-id', 'wrong-executable-emoji', 'missing-emoji', 'leaf-lost-later'])('retains a rejected group across a later unrelated edit: %s', async (fault) => {
  const original = reminderPreview()
  const removed = structuredClone(original)
  removed.items[0].fields.pop()
  if (fault !== 'missing-emoji') removed.items[0].fields.push({ ...removed.items[0].fields[0],
    field: 'emoji', newValue: '🍃', proposedValue: fault === 'wrong-executable-emoji' ? '💀' : '🍃', provenance: 'requested' })
  if (fault === 'different-id') removed.id = habitId
  if (fault === 'title-lost') removed.items[0].fields[0].proposedValue = 'Wrong'
  const vars = { ...varsFor(), baselinePreview: [original] }
  const requests = []
  const api = async (_method, path, body) => {
    requests.push(path)
    if (path.endsWith('/revise') && body.items.length) {
      expect(body.items[0].edits).toEqual({ description: 'A short water break.' })
      const revised = structuredClone(removed)
      revised.items[0].fields.push({ ...revised.items[0].fields[0], field: 'description', newValue: 'A short water break.',
        proposedValue: 'A short water break.', provenance: 'requested' })
      if (fault === 'leaf-lost-later') revised.items[0].fields.find((field) => field.field === 'emoji').proposedValue = '💀'
      if (fault === 'resurrected') revised.items[0].fields.push(original.items[0].fields[1])
      return { payload: { isSuccess: true, error: null, pendingOperationId: removed.id,
        preview: { items: revised.items, previewFingerprint: 'edited' }, cancelled: false } }
    }
    if (path.endsWith('/revise')) return { payload: { isSuccess: true, cancelled: true } }
    if (path.endsWith('/confirm')) return { status: 404 }
    return { payload: baseline() }
  }
  const promise = checkPreviewRejection(api, { composition: { pendingOperations: [removed] } }, vars)
  if (fault === 'valid') await expect(promise).resolves.toBeUndefined()
  else await expect(promise).rejects.toThrow()
  if (['wrong-executable-emoji', 'missing-emoji'].includes(fault)) expect(requests).toEqual([])
})

it.each(['valid', 'wrong-key', 'wrong-revision', 'unapproved-write'])('selects, revises, rejects and approves the issued step: %s', async (fault) => {
  const step = 'Take one breath'
  const vars = varsFor()
  vars.clientContext.selectedOfferKey = fault === 'wrong-key' ? 'unknown' : issued.offerKey
  const output = { composition: { parts: [{ kind: 'oneSmallStep', block: {
    suggestion: { goal: 'Begin', step, language: 'en' }, actions: [{ id: 'saveTask', label: 'Save as task', message: `Save ${step} as a task.` }],
  } }] } }
  let executed = false
  let rejected = false
  let turns = 0
  const task = preview(step)
  task.items[0].fields = [{ ...task.items[0].fields[1], field: 'title', proposedValue: step }, task.items[0].fields[1]]
  const api = async (_method, path, body) => {
    if (path.endsWith('/revise') && body.items.length) return { payload: { isSuccess: fault !== 'wrong-revision',
      pendingOperationId: task.id, preview: { items: task.items.map((item) => ({ ...item, fields: [...item.fields, { ...item.fields[0], field: 'emoji', proposedValue: '🍃' }] })), previewFingerprint: 'revised' } } }
    if (path.endsWith('/revise')) { rejected = true; return { payload: { isSuccess: true, cancelled: true } } }
    if (path.includes('/confirm')) return rejected && turns === 1 ? { status: 404 }
      : { payload: { pendingOperationId: task.id, confirmationToken: 'private-token' } }
    if (path.endsWith('/execute')) { executed = true; return { status: 200 } }
    if (path.startsWith('habits/')) return { payload: { id: habitId, title: step, frequencyUnit: null } }
    return { payload: { ...baseline(), habits: executed ? [{ id: habitId, title: step, frequencyUnit: null }]
      : fault === 'unapproved-write' ? [{ id: habitId, title: step }] : [] } }
  }
  const turn = async (input) => { turns++; expect(input).toBe(`Save ${step} as a task.`); return { composition: { pendingOperations: [task] } } }
  const promise = checkActionLifecycle(api, output, vars, turn)
  if (fault === 'valid') { await expect(promise).resolves.toMatchObject({ approved: true }); expect(turns).toBe(2) }
  else await expect(promise).rejects.toThrow()
})
