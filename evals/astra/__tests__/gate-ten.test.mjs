import { expect, it } from 'vitest'
import { composition } from '../assertions.mjs'
import gradingInput from '../grading-input.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
import { readCorpus } from '../grade-method.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { chatResponse, capacityFailureCall, apiKeysStepUpResponse, preview } from './fixtures/producer.mjs'

const corpus = readCorpus()

// One case with an outcome against the reply that its turn on the client path returns, with the trace of that reply.
async function receive(test, produced) {
  const clientContext = buildChatClientContext({ platform: 'mobile', locale: test.metadata.locale })
  const vars = { ...test.vars, clientContext, evalRequestId: 'request', accountDate: '2026-10-30', records: {} }
  const trace = { requestId: 'request', timing: produced.evalTrace.timing, modelCalls: 1, calls: produced.evalTrace.toolCalls
    .map((call) => ({ id: call.id, name: call.name, arguments: call.arguments, resultStatus: call.status, result: call.result })) }
  const { output } = await runOutcomeCase(vars, { send: async () => (
    { kind: 'final', response: produced, requestId: 'request', responseRequestId: 'request', trace }) })
  return { output, context: { vars, test } }
}

it('requires the habit capacity refusal rather than a held create preview', async () => {
  const test = corpus.find((entry) => entry.metadata.id === 'edge-free-limit-en')
  const produced = { ...chatResponse('request', [capacityFailureCall()]),
    aiMessage: "You've reached the 1,000 habit limit. You can adjust an existing habit.",
    parts: [{ type: 'text', text: "You've reached the 1,000 habit limit. You can adjust an existing habit." }],
    operations: [{ operationId: 'create_habit', sourceName: 'create_habit', status: 'Failed' }] }
  const { output, context } = await receive(test, produced)
  expect(outcome(output, context)).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
  expect(composition(output, context).pass).toBe(true)
  expect(test.vars.rubric).toContain('next step')
  const evidence = JSON.parse(gradingInput(output, context)).groundingEvidence
  expect(evidence.toolOutcomes).toContainEqual({ name: 'create_habit', status: 'Failed',
    error: "You've reached the {0} habit limit.",
    result: { error: "You've reached the {0} habit limit.", arguments: [1000], errorCode: 'HABIT_LIMIT_REACHED' } })
  const held = await receive(test, { ...produced, pendingOperations: [preview('Stretch')] })
  expect(outcome(held.output, held.context)).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
  expect(composition(held.output, held.context).pass).toBe(false)
  expect(composition({ ...output, composition: { ...output.composition,
    pendingOperations: [apiKeysStepUpResponse('request', {}).pendingOperations[0]] } }, context).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('requires and projects the emailed-code step-up surface in %s', async (locale) => {
  const test = corpus.find((entry) => entry.metadata.id === `composition-api-keys-${locale}`)
  const client = buildChatClientContext({ platform: 'mobile', locale })
  const produced = apiKeysStepUpResponse('request', client)
  const { output, context } = await receive(test, produced)
  expect(outcome(output, context)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  expect(composition(output, context).pass).toBe(true)
  const visible = JSON.parse(output.answer).pendingOperations[0]
  expect(visible).not.toHaveProperty('count')
  expect(visible).not.toHaveProperty('items')
  expect(visible.stepUp).toEqual(locale === 'en'
    ? { message: 'Confirm your identity on the device before this can continue.', actionLabel: 'Confirm identity' }
    : { message: 'Confirme a identidade no aparelho antes de continuar.', actionLabel: 'Confirmar identidade' })
  for (const mutate of [
    (response) => { response.pendingOperations = [] },
    (response) => { response.pendingOperations[0].confirmationRequirement = 'FreshConfirmation' },
    (response) => { response.pendingOperations[0].capabilityId = 'api-keys.manage' },
    (response) => { response.pendingOperations[0].changeTargetCount = 0; response.pendingOperations[0].items = [] },
    (response) => { response.pendingOperations.push(structuredClone(response.pendingOperations[0])) },
    (response) => { response.parts = [{ type: 'block', kind: 'recordList', block: { kind: 'keys', items: [], totalCount: 0 } }] },
  ]) {
    const invalid = structuredClone(produced)
    mutate(invalid)
    const received = await receive(test, invalid)
    expect(composition(received.output, received.context).pass).toBe(false)
  }
  const none = await receive(test, { ...structuredClone(produced), pendingOperations: [] })
  expect(outcome(none.output, none.context)).toMatchObject({ pass: false, reason: 'The reply holds no preview and no question card.' })
  const two = structuredClone(produced)
  two.pendingOperations.push(structuredClone(two.pendingOperations[0]))
  const doubled = await receive(test, two)
  expect(outcome(doubled.output, doubled.context)).toMatchObject({ pass: false, reason: 'The request is held in 2 previews.' })
})
