import { fileURLToPath } from 'node:url'
import { loadApiProvider } from 'promptfoo'

// The one grader path of an eval run: the provider that ORBIT_EVAL_GRADER names. promptfoo resolves a relative file://
// reference from the folder of the run's config, so the preflight (grader-preflight.mjs) records that folder and each later
// read resolves from it, never from another folder.
let configFolder

export function recordConfigFolder(folder) { configFolder = folder }

// `config` reaches the class of a file:// provider as options.config (claude-grader.mjs names the keys it reads).
export function loadGrader(folder, config) {
  return loadApiProvider(process.env.ORBIT_EVAL_GRADER, { basePath: folder && fileURLToPath(folder), options: { config } })
}

// One question to the configured grader, answered with the schema that `schema` names. It returns { value } with the parsed
// JSON answer, or { error }: a failed call or an answer that is not JSON is no answer.
export async function askGrader(prompt, { schema }) {
  const provider = await loadGrader(configFolder, { schema })
  const response = await provider.callApi(prompt)
  if (response?.error) return { error: response.error }
  try {
    return { value: JSON.parse(response?.output) }
  } catch {
    return { error: 'The configured grader answered with text that is not JSON.' }
  }
}
