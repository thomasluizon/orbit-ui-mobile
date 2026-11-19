import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

// The keys of the tool-name grade. A case that holds an `outcome` holds none of them, in its own turn or in its setup.
export const TOOL_NAME_KEYS = ['required', 'allowed', 'forbidden', 'counts', 'permittedMutations']

// How a case selects its grade method: a case that states its expected `outcome` runs on the client path and gets the
// outcome grade of the core set. Each other case runs on POST /api/chat and gets the tool-name grade.
export const gradedByOutcome = (vars) => vars?.outcome != null

export const readCorpus = () => ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) =>
  parse(readFileSync(new URL(path, import.meta.url), 'utf8'), { merge: true }))

const defaults = parse(readFileSync(new URL('./promptfooconfig.yaml', import.meta.url), 'utf8')).defaultTest.assert
const shared = (metric) => defaults.find((assertion) => assertion.metric === metric)
const outcomeAssertion = { type: 'javascript', value: 'file://client-path.mjs:outcome', metric: 'outcome' }

// The tests of the launch corpus. promptfoo gives each test the assertions of `defaultTest`, the tool-name grade, unless
// the test disables them (evaluator: `options.disableDefaultAsserts`). A case with an outcome disables them and gets its
// outcome, the composition of its answer and, when it holds a rubric, the model grade of its answer text.
export function corpusTests() {
  return readCorpus().map((test) => gradedByOutcome(test.vars) ? { ...test, options: { ...test.options, disableDefaultAsserts: true },
    assert: [outcomeAssertion, shared('composition'), ...(test.vars.rubric ? [shared('finalAnswer')] : [])] } : test)
}
