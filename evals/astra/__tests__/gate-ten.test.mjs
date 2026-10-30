import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { behavior, structural, composition } from '../assertions.mjs'
import gradingInput from '../grading-input.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { chatResponse, toolCall, capacityFailureCall, apiKeysStepUpResponse } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const scenarios = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

async function receive(test, produced) {
  vi.stubEnv(test.vars.credentialKey, 'offline-token')
  const clientContext = buildChatClientContext({ platform: 'mobile', locale: test.metadata.locale })
  const vars = { ...test.vars, clientContext, credentialKey: test.vars.credentialKey, evalRequestId: 'request',
    historyJson: '[]', clientContextJson: JSON.stringify(clientContext) }
  vi.stubGlobal('fetch', async () => Response.json(produced, { headers: { 'x-orbit-request-id': 'request' } }))
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
    url: 'https://astra.invalid/api/chat', transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
  return { output: (await provider.callApi(test.vars.input, { vars })).output, context: { vars, test } }
}

it('requires the habit capacity refusal rather than a held create preview', async () => {
  const test = scenarios.find((entry) => entry.metadata.id === 'edge-free-limit-en')
  const produced = { ...chatResponse('request', [capacityFailureCall()]),
    aiMessage: "You've reached the 1,000 habit limit. You can adjust an existing habit.",
    parts: [{ type: 'text', text: "You've reached the 1,000 habit limit. You can adjust an existing habit." }],
    operations: [{ operationId: 'create_habit', sourceName: 'create_habit', status: 'Failed' }] }
  const { output, context } = await receive(test, produced)
  expect((await structural(output, context)).pass).toBe(true)
  expect(behavior(output, context).pass).toBe(true)
  expect(composition(output, context).pass).toBe(true)
  expect(test.vars.rubric).toContain('next step')
  const evidence = JSON.parse(gradingInput(output, context)).groundingEvidence
  expect(evidence.toolOutcomes).toContainEqual({ name: 'create_habit', status: 'Failed',
    error: "You've reached the {0} habit limit.",
    result: { error: "You've reached the {0} habit limit.", arguments: [1000], errorCode: 'HABIT_LIMIT_REACHED' } })
  output.trace.calls[0].result.payload.errorCode = 'UNEXPECTED_FAILURE'
  expect(behavior(output, context).pass).toBe(false)
  for (const status of ['PendingConfirmation', 'Succeeded']) {
    const call = toolCall('create_habit', { title: 'Stretch', frequency_unit: 'Day' }, status)
    const alternative = await receive(test, { ...produced, evalTrace: chatResponse('request', [call]).evalTrace })
    expect(behavior(alternative.output, alternative.context).pass).toBe(false)
  }
  expect(composition({ ...output, composition: { ...output.composition,
    pendingOperations: [apiKeysStepUpResponse('request', {}).pendingOperations[0]] } }, context).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('requires and projects the emailed-code step-up surface in %s', async (locale) => {
  const test = corpus.find((entry) => entry.metadata.id === `composition-api-keys-${locale}`)
  const client = buildChatClientContext({ platform: 'mobile', locale })
  const produced = apiKeysStepUpResponse('request', client)
  const { output, context } = await receive(test, produced)
  expect((await structural(output, context)).pass).toBe(true)
  expect(behavior(output, context).pass).toBe(true)
  expect(composition(output, context).pass).toBe(true)
  const visible = JSON.parse(output.answer).pendingOperations[0]
  expect(visible).not.toHaveProperty('count')
  expect(visible).not.toHaveProperty('items')
  expect(visible.stepUp).toEqual(locale === 'en'
    ? { message: 'Confirm your identity on the device before this can continue.', actionLabel: 'Confirm identity' }
    : { message: 'Confirme a identidade no aparelho antes de continuar.', actionLabel: 'Confirmar identidade' })
  expect(test.vars.rubric).toContain('step-up')
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
  const succeeded = structuredClone(output)
  succeeded.trace.calls[0].resultStatus = 'Succeeded'
  succeeded.trace.calls[0].result.payload = null
  expect(behavior(succeeded, context).pass).toBe(false)
})

it('allows the catalog goal review without changing the Hoje required tool', () => {
  for (const locale of ['en', 'pt-BR']) {
    const goals = corpus.find((entry) => entry.metadata.id === `composition-goals-${locale}`)
    expect(goals.vars.expectations.allowed).toContain('review_goals')
    expect(corpus.find((entry) => entry.metadata.id === `composition-hoje-next-step-${locale}`)
      .vars.expectations.required).toEqual([{ name: 'get_daily_summary', arguments: { generate_narrative: true } }])
  }
})
