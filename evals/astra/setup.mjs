import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import AstraHttpProvider from './http-provider.mjs'
import { behavior, composition, structural } from './assertions.mjs'
import { publicApi } from './fixtures/api.mjs'
import { offerActions, proactiveOffers } from './proactive-offers.mjs'
import { readStartingHabits } from './step-persistence.mjs'

function prepareStartingAction(test, block) {
  const vars = test.vars
  vars.previousStartingStep = structuredClone(block.suggestion)
  const action = block.actions.find(({ id }) => id === vars.startingStepAction)
  vars.input = action.message
  vars.clientContext = { ...vars.clientContext }
  delete vars.clientContext.previousStartingStep
  if (action.id === 'smaller' && action.previousStep) vars.clientContext.previousStartingStep = structuredClone(action.previousStep)
  vars.clientContextJson = JSON.stringify(vars.clientContext)
  const required = vars.expectations.required[0]
  if (vars.startingStepAction === 'saveTask') required.arguments = { title: block.suggestion.step, frequency_unit: 'OneTime' }
  if (vars.startingStepAction !== 'saveChecklistItem') return
  const habit = vars.startingHabitBaseline.find((habit) => habit.id === vars.checklistHabitId)
  if (!habit?.checklistItems.length) throw new Error('Starting-step setup requires an owned habit with existing checklist items.')
  vars.input += vars.clientContext.locale === 'pt-BR' ? ` Use o hábito ${JSON.stringify(habit.title)}.` : ` Use the habit ${JSON.stringify(habit.title)}.`
  required.arguments = { anyOf: [
    { habit_id: habit.id, item_to_add: block.suggestion.step, checklist_items: { optional: null } },
    { habit_id: habit.id, item_to_add: { optional: null },
      checklist_items: [...habit.checklistItems, { text: block.suggestion.step, isChecked: false }]
        .map(({ text, isChecked }) => ({ text, is_checked: isChecked ? true : { optional: false } })) },
  ] }
}

export async function prepareCorrection(test) {
  const setup = test.vars.setup
  if (['saveTask', 'saveChecklistItem'].includes(test.vars.startingStepAction)) {
    test.vars.startingHabitBaseline = await readStartingHabits(test.vars.credentialKey)
  }
  const requestId = randomUUID()
  const configuration = parse(readFileSync(new URL('./promptfooconfig.yaml', import.meta.url), 'utf8'))
  const provider = new AstraHttpProvider({ config: {
    ...configuration.providers[0].config, transformResponse: `file://${fileURLToPath(new URL('./response.mjs', import.meta.url))}`,
  } })
  const vars = { ...test.vars, refine: undefined, ...setup, evalRequestId: requestId, historyJson: '[]', offerFamily: undefined }
  vars.clientContextJson = JSON.stringify(vars.clientContext)
  const response = await provider.callApi(setup.input, { vars })
  if (response.error || !response.output) throw new Error(`Correction setup${setup.caseId ? ` dependency ${setup.caseId}` : ''} returned no verifiable answer.`)
  const context = { vars, test }
  const checks = await Promise.all([structural(response.output, context), behavior(response.output, context), composition(response.output, context)])
  const failures = checks.filter((check) => check.pass !== true || check.metadata?.skipped || check.metadata?.unavailable)
  if (failures.length) {
    throw new Error(`Correction setup failed${setup.caseId ? ` dependency ${setup.caseId}` : ''}: ${failures.map((check) => check.reason).join('; ')}`)
  }
  if (test.vars.offerFamily) {
    const policy = { ...vars, offerFamily: setup.composition.mode === 'preview' ? 'repeat' : 'empty',
      offerRequireReadback: false }
    const offerCheck = proactiveOffers(response.output, { vars: policy })
    if (!offerCheck.pass) throw new Error(`Offer setup failed: ${offerCheck.reason}`)
    const actions = offerActions(response.output.composition)
    if (test.vars.offerFamily !== 'preview-rejection' && actions.length !== 1) throw new Error('Offer setup requires exactly one issued action.')
    test.vars.issuedOffer = structuredClone(actions[0] ?? null)
    if (test.vars.offerFamily === 'dismissal') {
      const dismissed = await publicApi(test.vars.credentialKey)('POST', 'chat/offers/dismiss', {
        conversationId: test.vars.clientContext.conversationId, offerKeys: [actions[0].action.offerKey],
      })
      if (dismissed.status !== 204) throw new Error('Offer dismissal did not return HTTP 204.')
    }
    if (test.vars.offerFamily === 'action-lifecycle') {
      test.vars.clientContext.selectedOfferKey = actions[0].action.offerKey
      test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
    }
  }
  if (test.vars.startingStepAction) prepareStartingAction(test, response.output.composition.parts[0].block)
  if (test.vars.refine) {
    const drafts = response.output.composition.parts.find((part) => part.kind === 'habitSuggestions').block.drafts
    test.vars.baselineDrafts = structuredClone(drafts)
    test.vars.refineDraft = structuredClone(drafts[0])
    return { test }
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
  return { test }
}
