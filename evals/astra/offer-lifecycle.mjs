import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { structural, behavior, composition } from './assertions.mjs'
import { offerActions, offerResult, offerSafety, proactiveOffers } from './proactive-offers.mjs'
import { publicApi } from './fixtures/api.mjs'
import { readOfferState } from './fixtures/offers.mjs'
import { refreshCredential, safeFailureMessage } from './credentials.mjs'
import { approveOfferTask, preservesOfferFields, rejectOfferPreview, removeOfferGroup, reviseOfferPreview } from './offer-preview.mjs'

async function verified(output, vars) {
  const context = { vars: { ...vars, offerRequireReadback: false }, test: { vars } }
  for (const grade of [structural, behavior, composition, vars.offerFamily ? proactiveOffers : offerSafety]) {
    const verdict = await grade(output, context)
    if (verdict.pass !== true || verdict.metadata?.unavailable || verdict.metadata?.skipped) throw new Error(verdict.reason)
  }
}

function continuation(vars, chat, evidence, output) {
  let history = [...JSON.parse(vars.historyJson ?? '[]'), { role: 'user', content: vars.input },
    { role: 'assistant', content: output.answer }]
  return async (input, policy = {}, client = vars.clientContext, reload = false) => {
    await refreshCredential(vars.credentialKey)
    const clientContext = { ...client }
    delete clientContext.selectedOfferKey
    const next = { ...vars, ...policy, input, clientContext, evalRequestId: randomUUID(),
      offerFamily: undefined, historyJson: JSON.stringify(reload ? [] : history), clientContextJson: JSON.stringify(clientContext) }
    const response = await chat(input, { vars: next })
    if (response.error || !response.output) throw new Error(response.error ?? 'Missing offer continuation response.')
    await verified(response.output, next)
    history = [...(reload ? [] : history), { role: 'user', content: input }, { role: 'assistant', content: response.output.answer }]
    evidence.push({ requestId: next.evalRequestId, conversationId: clientContext.conversationId,
      platform: clientContext.platform, reloaded: reload, actions: offerActions(response.output.composition).map(({ action }) => action) })
    return response.output
  }
}

export async function checkSuppression(api, vars, turn) {
  const issued = vars.issuedOffer?.action
  if (!issued) throw new Error('Dismissal lacks its issued semantic key.')
  const check = (output) => {
    if (offerActions(output.composition).some(({ action }) => action.offerKey === issued.offerKey)) throw new Error('Dismissed offer returned.')
  }
  for (let index = 0; index < 11; index++) {
    check(await turn(vars.clientContext.locale === 'pt-BR' ? 'Olá.' : 'Hello.', {
      composition: { mode: 'text' }, expectations: { allowed: [] },
    }))
  }
  const input = vars.setup.input
  const policy = { composition: { mode: 'data' }, expectations: { allowed: ['get_daily_summary', 'query_habits'] } }
  check(await turn(input, policy, vars.clientContext, true))
  check(await turn(input, policy, { ...vars.clientContext, platform: 'mobile' }, true))
  if (!isDeepStrictEqual(await readOfferState(api), vars.offerBaseline)) throw new Error('Dismissal or unrelated turns changed account fields.')
  const { payload: created } = await api('POST', 'habits', { title: vars.clientContext.locale === 'pt-BR' ? 'Respirar' : 'Breathe',
    description: null, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: vars.accountDate })
  if (typeof created?.id !== 'string') throw new Error('Different-offer fixture lacks its identity.')
  const baseline = await readOfferState(api)
  const different = await turn(vars.clientContext.locale === 'pt-BR' ? 'Liste meus hábitos de hoje.' : 'List my habits due today.', {
    ...policy, fixtureEvidence: { ...vars.fixtureEvidence, ...baseline },
  })
  const actions = offerActions(different.composition)
  if (actions.length !== 1 || actions[0].action.offerKey === issued.offerKey || !actions[0].action.offerKey.startsWith(`log:${created.id}:`)
    || !isDeepStrictEqual(await readOfferState(api), baseline)) throw new Error('A different eligible offer was suppressed or wrote data.')
}

export async function checkPreviewRejection(api, output, vars) {
  let pending = output.composition.pendingOperations?.[0]
  const original = vars.baselinePreview?.[0]
  if (!pending || !original || pending.id !== original.id) throw new Error('Suggestion rejection replaced the pending preview.')
  const removed = original.items.flatMap((item) => item.fields.filter((field) => field.provenance === 'suggested'
    && /(?:reminder|scheduled_reminders)/u.test(field.field)).map((field) => `${item.itemId}:${field.field}`))
  const edited = pending.items.map((item) => `${item.itemId}:emoji`)
  if (!removed.length || !preservesOfferFields(original, pending, removed, edited)
    || pending.items.some((item) => item.fields.some((field) => removed.includes(`${item.itemId}:${field.field}`) && field.provenance === 'suggested'))) {
    throw new Error('Suggested reminder removal lost requested or stored fields.')
  }
  const previous = pending
  pending = await reviseOfferPreview(api, pending, pending.items.map((item) => ({ itemId: item.itemId, edits: { emoji: '🍃' } })), vars.clientContext)
  if (!preservesOfferFields(previous, pending, [], edited)
    || pending.items.some((item) => item.fields.some((field) => removed.includes(`${item.itemId}:${field.field}`) && field.provenance === 'suggested'))) throw new Error('Unrelated revision regenerated rejected suggestions.')
  await rejectOfferPreview(api, pending, vars)
}

export async function checkActionLifecycle(api, output, vars, turn) {
  const block = output.composition.parts.find((part) => part.kind === 'oneSmallStep')?.block
  const save = block?.actions.find((action) => action.id === 'saveTask')
  if (!save || !vars.issuedOffer?.action || vars.clientContext.selectedOfferKey !== vars.issuedOffer.action.offerKey) throw new Error('Lifecycle did not select its actually issued offer.')
  const policy = { composition: { mode: 'preview', previews: 1 }, expectations: {
    permittedMutations: [{ name: 'create_habit' }, { name: 'bulk_create_habits' }, { name: 'revise_pending_changes' }],
  } }
  const proposed = await turn(save.message, policy)
  let pending = proposed.composition.pendingOperations[0]
  const removed = await removeOfferGroup(api, pending, vars.clientContext)
  pending = removed.pending
  const revised = await reviseOfferPreview(api, pending, pending.items.map((item) => ({ itemId: item.itemId, edits: { emoji: '🍃' } })), vars.clientContext)
  if (!preservesOfferFields(pending, revised, [], revised.items.map((item) => `${item.itemId}:emoji`))) throw new Error('Lifecycle revision changed unapproved fields.')
  await rejectOfferPreview(api, revised, vars)
  const reproposed = await turn(save.message, policy)
  let approval = reproposed.composition.pendingOperations[0]
  let suggestions = approval.items.flatMap((item) => item.fields).filter((field) => field.provenance === 'suggested').length
  while (suggestions > 0) {
    approval = (await removeOfferGroup(api, approval, vars.clientContext)).pending
    const remaining = approval.items.flatMap((item) => item.fields).filter((field) => field.provenance === 'suggested').length
    if (remaining >= suggestions) throw new Error('Approval retained a rejected suggestion.')
    suggestions = remaining
  }
  return approveOfferTask(api, approval, vars, block.suggestion.step)
}

export async function checkReadScopes(api, vars, turn) {
  const date = new Date(Date.parse(`${vars.accountDate}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const locale = vars.clientContext.locale
  const historical = await turn(locale === 'pt-BR' ? `Liste meus hábitos agendados em ${date}.` : `List my habits scheduled on ${date}.`, {
    composition: { mode: 'data', kinds: ['habitList'] }, expectations: { required: [{ name: 'query_habits', arguments: { date } }] },
  })
  if (offerActions(historical.composition).some(({ action }) => ['log', 'skip', 'restart', 'smallStep'].includes(action.offerKey.split(':')[0]))) throw new Error('Historical scope received a current-day offer.')
  const partial = await turn(locale === 'pt-BR' ? 'Liste meus hábitos de hoje, apenas o primeiro resultado, com limite 1.'
    : 'List my habits today, only the first result with limit 1.', {
    composition: { mode: 'data', blocks: [{ kind: 'habitList', completeness: 'partial' }] },
    expectations: { required: [{ name: 'query_habits', arguments: { limit: 1 } }] },
  })
  if (offerActions(partial.composition).length || !isDeepStrictEqual(await readOfferState(api), vars.offerBaseline)) throw new Error('Partial scope offered an unsafe action or changed stored fields.')
}

async function checkEditablePreview(api, output, vars) {
  const original = output.composition.pendingOperations?.[0]
  if (!original) throw new Error('Offer fixture lacks its held preview.')
  const removed = await removeOfferGroup(api, original, vars.clientContext)
  const pending = removed.pending
  const revised = await reviseOfferPreview(api, pending, pending.items.map((item) => ({ itemId: item.itemId,
    edits: { emoji: '🍃' },
  })), vars.clientContext)
  if (!preservesOfferFields(pending, revised, [], revised.items.map((item) => `${item.itemId}:emoji`))
    || revised.items.some((item) => item.fields.some((field) => removed.removed.includes(`${item.itemId}:${field.field}`)
      && field.provenance === 'suggested'))) throw new Error('Editing regenerated a rejected suggestion or changed another field.')
  await rejectOfferPreview(api, revised, vars)
}

export async function completeOfferAttempt(output, vars, chat) {
  const api = publicApi(vars.credentialKey)
  const turns = []
  try {
    await verified(output, vars)
    if (!vars.offerBaseline || !isDeepStrictEqual(await readOfferState(api), vars.offerBaseline)) throw new Error('Offer turn changed persisted fields without approval.')
    const turn = continuation(vars, chat, turns, output)
    let approval
    if (vars.offerFamily === 'dismissal') {
      if (offerActions(output.composition).some(({ action }) => action.offerKey === vars.issuedOffer?.action.offerKey)) throw new Error('Dismissed offer returned on the dismissal turn.')
      await checkSuppression(api, vars, turn)
    }
    if (vars.offerFamily === 'preview-rejection') await checkPreviewRejection(api, output, vars)
    if (vars.offerFamily === 'action-lifecycle') approval = await checkActionLifecycle(api, output, vars, turn)
    if (vars.composition.mode === 'preview' && vars.offerFamily !== 'preview-rejection') await checkEditablePreview(api, output, vars)
    if (vars.offerFamily === 'due-log') await checkReadScopes(api, vars, turn)
    return { ...offerResult(true, 'Verified held fields, lifecycle and independent persisted readback.'), turns, approval }
  } catch (error) {
    return { ...offerResult(false, safeFailureMessage(error)), turns }
  }
}
