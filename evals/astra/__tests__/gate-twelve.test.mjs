import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import gradingInput from '../grading-input.mjs'
import parseResponse from '../response.mjs'
import { behavior, structural } from '../assertions.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { chatResponse, toolCall, habitAccountRead } from './fixtures/producer.mjs'

it('offers ask in the shipped parts catalog and excludes it from the legacy catalog', () => {
  const { tools, legacyTools } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
  expect(tools.some((tool) => tool.function.name === 'ask')).toBe(true)
  expect(legacyTools.some((tool) => tool.function.name === 'ask')).toBe(false)
})

// Producer: AskTool.BuildFormSchema and RecordToolRound retain the model's input wrapper in the trace.
it.each(['en', 'pt-BR'])('validates the declared choice input and rejects flat ask arguments in %s', async (locale) => {
  const clientContext = buildChatClientContext({ platform: 'web', locale })
  const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
  const test = corpus.find((entry) => entry.metadata.id === `composition-choice-${locale}`)
  const input = { form: 'choice', missing_input: 'record_selection', question: locale === 'en' ? 'Which habit?' : 'Qual hábito?',
    options: [{ id: 'water', label: 'Water', description: null }, { id: 'walk', label: 'Walk', description: null }],
    multiSelect: false, allowFreeText: true }
  const context = { vars: { ...test.vars, clientContext, evalRequestId: 'request' }, test: { vars: {} } }
  for (const arguments_ of [{ input }, input]) {
    const output = parseResponse(chatResponse('request', [habitAccountRead(true, 'read', clientContext),
      toolCall('ask', arguments_, 'Succeeded', 'call-1', clientContext)]), '',
      { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
    const valid = Object.hasOwn(arguments_, 'input')
    const structure = await structural(output, context)
    expect(structure.pass, structure.reason).toBe(valid)
    const outcome = behavior(output, context)
    expect(outcome.pass, outcome.reason).toBe(valid)
  }
})

// Producer: ProcessUserChatCommand.ToolResults.BuildToolError and ChatEvalTraceCollector.Record.
it.each([
  ['Denied', 'get_habit_metrics', 'Policy denied: target_not_owned:get_habit_metrics:habit'],
  ['UnsupportedByPolicy', 'get_profile', 'Operation is unsupported by policy.'],
])('grounds the %s error without accepting mismatched or malformed evidence', (status, name, error) => {
  const call = toolCall(name, {}, status)
  call.result.error = error
  const response = chatResponse('request', [call])
  const output = parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } })
  const grade = (candidate = output, evalRequestId = 'request') => JSON.parse(gradingInput(candidate, { vars: { evalRequestId } }))
  expect(grade().groundingEvidence.toolOutcomes).toEqual([{ name, status, error, result: null }])
  expect(grade().groundingEvidence.successfulTools).toEqual([])
  expect(grade(output, 'other-request').groundingEvidence.toolOutcomes).toEqual([])
  expect(grade({ ...output, trace: { ...output.trace, requestId: 'other-request' } }).groundingEvidence.toolOutcomes).toEqual([])
  for (const result of [{ ...call.result, success: true }, { ...call.result, error: null }]) {
    expect(grade({ ...output, trace: { ...output.trace, calls: [{ ...output.trace.calls[0], result }] } })
      .groundingEvidence.toolOutcomes).toEqual([])
  }
})

it('finishes the failed gate hook after writing both summaries and exits nonzero without a stack trace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astra-gate-exit-'))
  try {
    const hookUrl = new URL('../hooks.mjs', import.meta.url).href
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { afterAll } from ${JSON.stringify(hookUrl)};
      const test = { metadata: { id: 'failed-case', locale: 'en' }, vars: {} };
      afterAll({ suite: { tests: [test] }, results: [{ testCase: test, success: false,
        gradingResult: { componentResults: [{ assertion: { metric: 'composition' }, pass: false, reason: 'Expected failure.' }] } }] });
      process.stdout.write('Hook completed.');
    `], { cwd: directory, encoding: 'utf8', timeout: 45000,
      env: { ...process.env, GITHUB_STEP_SUMMARY: join(directory, 'step-summary.md') } })
    expect(run.error).toBeUndefined()
    expect(JSON.parse(readFileSync(join(directory, 'reports/summary.json'), 'utf8')).status).toBe('fail')
    const summary = readFileSync(join(directory, 'reports/summary.md'), 'utf8')
    expect(readFileSync(join(directory, 'step-summary.md'), 'utf8')).toBe(summary)
    expect(readFileSync(join(directory, 'reports/results.json'), 'utf8')).toContain('failed-case')
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('Hook completed.')
    expect(run.stderr).not.toContain('Error:')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
