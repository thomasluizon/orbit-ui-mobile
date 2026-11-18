import { fileURLToPath } from 'node:url'
import { loadApiProvider } from 'promptfoo'

const probe = 'Grade the answer against the rubric.\nAnswer: Water is ready.\nRubric: The answer names Water.'

// One small rubric through the configured grader, before any chat turn spends the eval key. A grader that cannot grade
// (no worker account directory, an expired sign-in, no CLI, a reference that does not load) would otherwise turn every
// graded attempt incomplete after its turn spent. configFolder is the folder of the run's config, because promptfoo
// resolves a relative file:// grader of the rubric from there. The grade itself does not matter, only that one came back.
export async function requireGrader(configFolder) {
  const provider = await loadApiProvider(process.env.ORBIT_EVAL_GRADER, { basePath: fileURLToPath(configFolder) })
  const response = await provider.callApi(probe)
  if (response?.error || response?.output === undefined) {
    throw new Error(`The configured grader cannot grade, so the run stops before any chat turn spends: ${response?.error ?? 'no grade came back'}`)
  }
}
