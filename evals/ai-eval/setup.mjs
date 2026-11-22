import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import OrbitHttpProvider from './http-provider.mjs'
import { behavior, composition, structural } from './assertions.mjs'
import { publicApi } from './fixtures/api.mjs'
import { offerActions, proactiveOfferSetup } from './proactive-offers.mjs'
import { attemptEvidence } from './evidence.mjs'
import { followConversation } from './offer-context.mjs'
import { caseClientContext, holdCase, openCaseConversation, outcome } from './client-path.mjs'

// The values that a case takes from its setup turn: `{ previousStep: true }` is the step that the setup turn showed, and
// `{ appendsPreviousStep: true }` is the checklist of the named habit with that step appended unchecked.
function resolvedOutcome(value, step, checklist) {
  if (Array.isArray(value)) return value.map((entry) => resolvedOutcome(entry, step, checklist))
  if (!value || typeof value !== 'object') return value
  if (value.previousStep === true) return step
  if (value.appendsPreviousStep === true) return { checklist: [...checklist.map(({ text, isChecked }) => ({ text, checked: isChecked })), { text: step, checked: false }] }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolvedOutcome(child, step, checklist)]))
}

// The follow-up turn of a starting-step case: the person presses the action of the block that the setup turn showed, as the
// client does. The client sends the request of the action and, for a smaller step, the previous step; a save request for
// a checklist names the habit.
function prepareStartingAction(vars, block, conversation) {
  vars.previousStartingStep = structuredClone(block.suggestion)
  const action = block.actions.find(({ id }) => id === vars.startingStepAction)
  vars.input = action.message
  vars.clientContext = { ...vars.clientContext }
  delete vars.clientContext.previousStartingStep
  if (action.id === 'smaller' && action.previousStep) vars.clientContext.previousStartingStep = structuredClone(action.previousStep)
  vars.clientContextJson = JSON.stringify(vars.clientContext)
  conversation.context = caseClientContext(vars.clientContext)
  // The step client with no starting-step block predates conversationId: it sends its own history, and the server holds no
  // conversation to continue.
  if (vars.composition.mode === 'one-small-step-legacy') conversation.conversationId = undefined
  const habit = vars.fixtureEvidence.habits.find((stored) => stored.id === vars.checklistHabitId)
  if (vars.startingStepAction === 'saveChecklistItem') {
    if (!habit?.checklistItems.length) throw new Error('Starting-step setup requires an owned habit with existing checklist items.')
    vars.input += vars.clientContext.locale === 'pt-BR' ? ` Use o hábito ${JSON.stringify(habit.title)}.` : ` Use the habit ${JSON.stringify(habit.title)}.`
  }
  if (vars.outcome.changes) vars.outcome = resolvedOutcome(vars.outcome, block.suggestion.step, habit?.checklistItems ?? [])
}

// The setup of an offers case: its first turn must issue the offer that the case continues from. The person dismisses
// the issued offer, or selects it, through the API as a client does.
async function prepareOfferSetup(test, held, setup) {
  const vars = test.vars
  const context = { vars: { ...setup, offerFamily: undefined }, test }
  const structure = await composition(held, context)
  if (structure.pass !== true || structure.metadata?.skipped || structure.metadata?.unavailable) {
    throw new Error(`Correction setup failed: ${structure.reason}`)
  }
  const previewFamily = vars.offerFamily === 'preview-rejection' ? 'preview-rejection' : 'repeat'
  const offerCheck = proactiveOfferSetup(held, { vars: { ...setup, offerFamily: setup.composition.mode === 'preview' ? previewFamily : 'empty',
    offerRequireReadback: false } })
  if (!offerCheck.pass) throw new Error(`Offer setup failed: ${offerCheck.reason}`)
  const actions = offerActions(held.composition)
  if (vars.offerFamily !== 'preview-rejection' && actions.length !== 1) throw new Error('Offer setup requires exactly one issued action.')
  vars.issuedOffer = structuredClone(actions[0] ?? null)
  if (vars.offerFamily === 'dismissal') {
    const dismissed = await publicApi(vars.credentialKey)('POST', 'chat/offers/dismiss', {
      conversationId: vars.clientContext.conversationId, offerKeys: [actions[0].action.offerKey],
    })
    if (dismissed.status !== 204) throw new Error('Offer dismissal did not return HTTP 204.')
  }
  if (vars.offerFamily === 'action-lifecycle') {
    vars.clientContext.selectedOfferKey = actions[0].action.offerKey
  }
}

// The setup of a case with an outcome runs on the client path, in the conversation of the case: its turn is graded by its
// outcome and a preview stays held, so the turn of the case continues it. A setup that states a client of its own runs on
// that client, and the turn of the case then continues on the client that the case states. A setup whose turn the case
// reads (a starting step to act on, a suggestion draft to refine) must also show the answer that its composition states.
async function prepareHeldPreview(test) {
  const vars = test.vars
  const { caseId: _caseId, ...turn } = vars.setup
  const setup = { ...vars, refine: undefined, ...turn, evalRequestId: randomUUID() }
  const conversation = openCaseConversation(setup)
  const held = await holdCase(setup, { conversation })
  if (vars.offerFamily) {
    vars.setupEvidence = { ...attemptEvidence({ response: { output: held }, testCase: { vars: setup } }, { pass: false, assertions: [] }),
      requestId: setup.evalRequestId }
  }
  const verdict = held.error ? { pass: false, reason: held.error } : outcome(held, { vars: setup })
  const shape = verdict.pass && (vars.startingStepAction || vars.refine) ? await composition(held, { vars: setup }) : verdict
  if (!shape.pass || shape.metadata?.unavailable) {
    throw new Error(`Correction setup failed${vars.setup.caseId ? ` dependency ${vars.setup.caseId}` : ''}: ${shape.reason}`)
  }
  vars.baselinePreview = held.previews
  vars.conversation = conversation
  if (vars.offerFamily) await prepareOfferSetup(test, held, setup)
  conversation.context = caseClientContext(vars.clientContext)
  if (vars.startingStepAction) prepareStartingAction(vars, held.composition.parts[0].block, conversation)
  if (vars.refine) {
    const drafts = held.composition.parts.find((part) => part.kind === 'habitSuggestions').block.drafts
    vars.baselineDrafts = structuredClone(drafts)
    vars.refineDraft = structuredClone(drafts[0])
  }
  return { test }
}

export async function prepareCorrection(test) {
  delete test.vars.setupEvidence
  if (test.vars.setup.outcome) return prepareHeldPreview(test)
  const setup = test.vars.setup
  const requestId = randomUUID()
  const configuration = parse(readFileSync(new URL('./promptfooconfig.yaml', import.meta.url), 'utf8'))
  const provider = new OrbitHttpProvider({ config: {
    ...configuration.providers[0].config, transformResponse: `file://${fileURLToPath(new URL('./response.mjs', import.meta.url))}`,
  } })
  const vars = { ...test.vars, refine: undefined, ...setup, evalRequestId: requestId, historyJson: '[]', offerFamily: undefined }
  vars.clientContextJson = JSON.stringify(vars.clientContext)
  const response = await provider.callApi(setup.input, { vars })
  test.vars.setupEvidence = { ...attemptEvidence({ response, testCase: { vars } }, { pass: false, assertions: [] }), requestId }
  if (response.error || !response.output) throw new Error(`Correction setup${setup.caseId ? ` dependency ${setup.caseId}` : ''} returned no verifiable answer.`)
  const context = { vars, test }
  const checks = await Promise.all([structural(response.output, context), behavior(response.output, context), composition(response.output, context)])
  const failures = checks.filter((check) => check.pass !== true || check.metadata?.skipped || check.metadata?.unavailable)
  if (failures.length) {
    throw new Error(`Correction setup failed${setup.caseId ? ` dependency ${setup.caseId}` : ''}: ${failures.map((check) => check.reason).join('; ')}`)
  }
  // A follow-up on the setup's own client continues its conversation. A setup with a client of its own keeps the
  // follow-up's context.
  if (!setup.clientContext) {
    test.vars.clientContext = followConversation(test.vars.clientContext, response.output)
    test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
  }
  test.vars.baselinePreview = response.output.composition.pendingOperations
  const correction = test.vars.composition?.correction
  const operation = test.vars.expectations?.required?.[0]
  if (correction && operation?.name === 'revise_pending_changes') {
    const previews = test.vars.baselinePreview
    const targets = previews?.length === 1 ? previews[0].items?.filter((item) =>
      item.entityName.toLocaleLowerCase().includes(correction.titleContains.toLocaleLowerCase())) : []
    if (targets?.length !== 1 || !targets[0].fields.some((field) => field.field === correction.field)) {
      throw new Error('Correction setup lacks one verifiable preview target.')
    }
    operation.arguments = {
      pending_operation_id: previews[0].id,
      items: [{ item_id: targets[0].itemId, edits_json: { jsonEquals: { [correction.field]: correction.value } } }],
      remove_item_ids: { optional: [] },
      answer_question: { optional: false },
    }
  }
  test.vars.historyJson = JSON.stringify([{ role: 'user', content: setup.input }, { role: 'assistant', content: response.output.answer }])
  delete test.vars.setupEvidence
  return { test }
}
