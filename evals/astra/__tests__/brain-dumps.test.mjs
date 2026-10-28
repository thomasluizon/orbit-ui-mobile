import { expect, it } from 'vitest'
import { brainDumpPreview } from '../brain-dumps.mjs'
import { behavior, structural, composition } from '../assertions.mjs'
import { brainDumpAttempt, brainDumpCases } from './fixtures/brain-dump.mjs'

it('includes all brain dump families in both locales', () => {
  expect(brainDumpCases).toHaveLength(6)
  for (const family of ['mixed', 'reuse', 'ideas']) {
    expect(brainDumpCases.filter((entry) => entry.metadata.family === `brain-dump-${family}`)
      .map((entry) => entry.metadata.locale)).toEqual(['en', 'pt-BR'])
  }
})

it.each(brainDumpCases)('grades the producer contract for $metadata.id', async (source) => {
  const { test, output } = brainDumpAttempt(source)
  for (const grade of [structural, behavior, composition]) {
    const verdict = await grade(output, { vars: test.vars, test })
    expect(verdict.pass, verdict.reason).toBe(true)
  }
  output.composition.aiMessage = 'Confira a prévia.'
  output.composition.parts = [{ type: 'text', text: output.composition.aiMessage }]
  expect(brainDumpPreview(output, test.vars).pass).toBe(true)
})

it.each([
  ['missing preview', (output) => { output.composition.pendingOperations = [] }],
  ['split preview', (output) => { output.composition.pendingOperations.push(structuredClone(output.composition.pendingOperations[0])) }],
  ['persisted call', (output) => { output.trace.calls[0].resultStatus = 'Succeeded' }],
  ['missing type', (output) => { delete output.composition.pendingOperations[0].items[0].habitType }],
  ['wrong type', (output) => { output.composition.pendingOperations[0].items[0].habitType = 'Habit' }],
  ['missing task', (output) => { output.trace.calls[0].arguments.habits.shift() }],
  ['wrong schedule', (output) => { output.trace.calls[0].arguments.habits[0].due_date = '2026-11-01' }],
  ['hidden time', (output) => { output.composition.pendingOperations[0].items[1].fields = output.composition.pendingOperations[0].items[1].fields.filter((field) => field.field !== 'due_time') }],
  ['duplicate identity', (output) => { output.composition.pendingOperations[0].items[1].itemId = '0' }],
  ['figures', (output) => { output.composition.aiMessage = 'Here are 2 items.'; output.composition.parts = [{ type: 'text', text: output.composition.aiMessage }] }],
  ['two sentences', (output) => { output.composition.aiMessage = 'Ready. Please approve.'; output.composition.parts = [{ type: 'text', text: output.composition.aiMessage }] }],
  ['extra block', (output) => { output.composition.parts = [{ type: 'block', kind: 'habitSuggestions', block: {} }] }],
])('rejects %s', (_, mutate) => {
  const { test, output } = brainDumpAttempt()
  mutate(output)
  expect(brainDumpPreview(output, test.vars).pass).toBe(false)
})

it('requires reuse in both tool arguments and preview identity', () => {
  const source = brainDumpCases.find((entry) => entry.metadata.family === 'brain-dump-reuse')
  for (const target of ['arguments', 'preview']) {
    const { test, output } = brainDumpAttempt(source)
    if (target === 'arguments') delete output.trace.calls[0].arguments.habits[2].habit_id
    else output.composition.pendingOperations[0].items[2].entityId = null
    expect(brainDumpPreview(output, test.vars).pass).toBe(false)
  }
})

it('requires the actual suggested draft to join the bulk preview', () => {
  const source = brainDumpCases.find((entry) => entry.metadata.family === 'brain-dump-ideas')
  for (const mutate of [
    (output) => { output.trace.calls[0].result.payload.drafts = [] },
    (output) => { output.trace.calls[1].arguments.habits[2].title = 'Unrelated' },
    (output) => { output.trace.calls[1].arguments.habits[2].due_time = '23:00' },
  ]) {
    const { test, output } = brainDumpAttempt(source)
    mutate(output)
    expect(brainDumpPreview(output, test.vars).pass).toBe(false)
  }
})
