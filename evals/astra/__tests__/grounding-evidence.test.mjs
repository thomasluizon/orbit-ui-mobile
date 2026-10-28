import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { assertions } from 'promptfoo'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { beforeEach as prepareAttempt } from '../hooks.mjs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-seven.json', import.meta.url), 'utf8'))

async function gradeRecorded(attempt, unsupported = false) {
  offlineCredentials()
  const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true,
    exhausted: false, capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
  vi.stubGlobal('fetch', fixtureFetch(() => state))
  try {
    const source = structuredClone(corpus.find((entry) => entry.metadata.id === attempt.caseId))
    const { test } = await prepareAttempt({ test: source })
    const grader = { id: () => 'grounding-control', callApi: vi.fn(async (prompt) => {
      const rendered = JSON.parse(prompt).map((message) => message.content).join('\n')
      const grounded = rendered.includes('Consistent hydration') && rendered.includes('targetValue')
        && rendered.includes('"value":1') && rendered.includes('Unsupported figures still fail');
      return { output: JSON.stringify({ pass: grounded && !rendered.includes('99 completions'), score: grounded && !rendered.includes('99 completions') ? 1 : 0,
        reason: grounded ? 'Evidence received; unsupported figures still fail.' : 'Missing fixture evidence.' }) }
    }) }
    const result = await assertions.runAssertion({ prompt: test.vars.input,
      assertion: configuration.defaultTest.assert.find(({ type }) => type === 'llm-rubric'),
      test: { ...test, options: { provider: grader } }, vars: test.vars,
      providerResponse: { output: { answer: unsupported ? attempt.answer.replace('5 completions', '99 completions') : attempt.answer } },
    })
    return { result, prompt: JSON.parse(grader.callApi.mock.calls[0][0]).map((message) => message.content).join('\n'), test }
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
}

it.each(recorded.slice(0, 2))('grounds the recorded $caseId answer in verified fixture facts', async (attempt) => {
  const { result, prompt, test } = await gradeRecorded(attempt)
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(result.pass).toBe(true)
  expect(prompt).toContain('checklistTemplates')
  expect(prompt).toContain('apiKeys')
  expect(prompt).not.toContain('orbit-eval-pro@gmail.com')
})
it('retains a failed rubric verdict for an unsupported ranking figure', async () => {
  const { result, prompt } = await gradeRecorded(recorded[1], true)
  expect(prompt).toContain('99 completions')
  expect(result.pass).toBe(false)
})

it('grounds only successful results and removes identifiers and credentials recursively', async () => {
  const { default: gradingInput } = await import('../grading-input.mjs')
  const { retrospectiveResponse } = await import('./fixtures/public-api.mjs')
  const { toolCall } = await import('./fixtures/producer.mjs')
  const succeeded = toolCall('get_retrospective', { period: 'month' })
  succeeded.result.payload = retrospectiveResponse(true)
  const failed = toolCall('get_profile', {}, 'Failed', 'failure')
  const payload = gradingInput({ answer: 'Saved retrospective narrative.', trace: { calls: [
    { ...succeeded, resultStatus: succeeded.status }, { ...failed, resultStatus: failed.status },
  ] } }, { vars: { fixtureEvidence: { apiKeys: [{ id: 'private-key-id', name: 'Read access',
    keyPrefix: 'private-key-prefix', token: 'private-token' }], habits: [{ title: 'Water', id: 'private-habit-id' }] } } })
  expect(payload).toContain('Saved retrospective narrative.')
  expect(payload).toContain('Read access')
  expect(payload).not.toContain('private-')
  const parsed = JSON.parse(payload)
  expect(parsed.groundingEvidence.successfulTools).toEqual([{ name: 'get_retrospective', result: {
    ...retrospectiveResponse(true), sourceRevision: undefined,
  } }])
})
