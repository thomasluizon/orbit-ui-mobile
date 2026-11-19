import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askGrader, useConfigFolder } from '../grader-provider.mjs'
import { requireGrader } from '../grader-preflight.mjs'
import { recordingGrader } from './fixtures/recording-grader.mjs'

let directory
const calls = () => (existsSync(process.env.TEST_GRADER_RECORD) ? readFileSync(process.env.TEST_GRADER_RECORD, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [])

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'astra-grader-provider-'))
  vi.stubEnv('TEST_GRADER_RECORD', join(directory, 'calls.jsonl'))
  vi.stubEnv('ORBIT_EVAL_GRADER', recordingGrader)
})
afterEach(() => { useConfigFolder(undefined); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }) })

// Contract: loadApiProvider of promptfoo hands options.config of the reference to the class of a file:// provider.
it('asks the provider that ORBIT_EVAL_GRADER names, with the schema that the question names, and parses its JSON answer', async () => {
  expect(await askGrader('Which half?', { schema: 'half' })).toEqual({ value: { half: 'deleted' } })
  expect(calls()).toEqual([{ schema: 'half', prompt: 'Which half?' }])
})

it('returns the error of a failed call of the provider, and an error for an answer that is not JSON', async () => {
  vi.stubEnv('TEST_GRADER_MODE', 'error')
  expect(await askGrader('Which half?', { schema: 'half' })).toEqual({ error: 'Recording grader failed.' })
  vi.stubEnv('TEST_GRADER_MODE', 'text')
  expect(await askGrader('Which half?', { schema: 'half' })).toEqual({ error: 'The configured grader answered with text that is not JSON.' })
})

// promptfoo resolves a relative file:// grader from the folder of the run's config; the preflight records that folder and the
// card question read resolves from it, as the rubric does.
it('resolves a relative reference from the folder that the preflight recorded', async () => {
  vi.stubEnv('ORBIT_EVAL_GRADER', 'file://recording-grader.mjs')
  await requireGrader(new URL('./fixtures/', import.meta.url))
  expect(await askGrader('Which half?', { schema: 'half' })).toEqual({ value: { half: 'deleted' } })
  expect(calls().map(({ schema }) => schema)).toEqual([null, 'half'])
})
