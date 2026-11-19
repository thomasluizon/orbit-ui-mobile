import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const GRADER_MODEL = 'claude-opus-5-5'
const GRADER_TIMEOUT_MILLISECONDS = 120000
// The variable that names the worker account directory: workers.claude.configDirEnv of .claude/orchestrator.json, which
// tools/launch-worker.mjs reads. claude-grader.test.mjs holds the two names equal.
export const WORKER_CONFIG_VARIABLE = 'ORBIT_WORKER_CLAUDE_CONFIG_DIR'
const rubricSchema = readFileSync(new URL('./grader-schema.json', import.meta.url), 'utf8')
// The card question read of same-title-card.mjs asks for one key, `half`, and checks the strict shape itself.
const halfSchema = JSON.stringify({ type: 'object', additionalProperties: false, properties: { half: { type: 'string' } }, required: ['half'] })
// Each variable that the CLI selects ahead of the sign-in in its config directory starts with one of these names. The
// worker launch removes the same variables through workerAccountEnvironment of tools/lib/orchestrator-config.mjs, and
// claude-grader.test.mjs holds the grader equal to that function.
const accountOverride = /^(?:ANTHROPIC_|CLAUDE_CODE_|CCR_|AWS_BEARER_TOKEN_BEDROCK$)/u

// Print mode of the installed CLI, confirmed against a real call (claude-grader.test.mjs records its response): the answer
// comes back as structured_output of one JSON result. The grader reads no tool, MCP server, CLAUDE.md, hook or session,
// and graderEnvironment turns off the file attachment that an @/path mention in the prompt would otherwise add.
const graderArguments = (schema) => ['-p', '--model', GRADER_MODEL, '--output-format', 'json', '--json-schema', schema,
  '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence']

const isGrade = (grade) => grade !== null && typeof grade === 'object' && Object.keys(grade).sort().join(',') === 'pass,reason,score'
  && typeof grade.pass === 'boolean' && typeof grade.score === 'number' && Number.isFinite(grade.score)
  && grade.score >= 0 && grade.score <= 1 && typeof grade.reason === 'string' && grade.reason.trim() !== ''

const parsed = (text) => { try { return JSON.parse(text) } catch { return null } }
// Only the enumerated fields of a failed result reach the error: its text can quote the grading prompt.
const failedResult = (result) => [result?.terminal_reason, Number.isInteger(result?.api_error_status) ? `HTTP ${result.api_error_status}` : null]
  .filter((part) => typeof part === 'string' && /^[\w ]+$/u.test(part)).join(', ')

class GradeFailure extends Error {}

// The child environment: the sign-in of the worker account directory is the only credential the CLI can select, and no
// Orbit eval secret reaches it. Unset, or naming no directory, the grader fails closed and never spends the main account.
// The prompt holds Astra's answer, untrusted text, so the attachment guard is set after the filter that removes a runner value.
export function graderEnvironment(environment = process.env) {
  const directory = environment[WORKER_CONFIG_VARIABLE]?.trim()
  if (!directory) throw new GradeFailure(`${WORKER_CONFIG_VARIABLE} is not set`)
  const configDirectory = resolve(directory)
  if (!statSync(configDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new GradeFailure(`${WORKER_CONFIG_VARIABLE} names no existing directory`)
  }
  const kept = Object.entries(environment).filter(([key]) => !key.startsWith('ORBIT_EVAL_') && !accountOverride.test(key))
  return { ...Object.fromEntries(kept), CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_CODE_DISABLE_ATTACHMENTS: '1' }
}

function runCli(prompt, schema, environment, directory, signal) {
  return new Promise((resolve, reject) => {
    const child = execFile('claude', graderArguments(schema), { cwd: directory, env: environment,
      timeout: GRADER_TIMEOUT_MILLISECONDS, maxBuffer: 1024 * 1024, signal }, (error, stdout) => {
      if (!error) return resolve(stdout)
      const detail = failedResult(parsed(stdout))
      reject(new GradeFailure(error.code === 'ENOENT' ? 'installed executable unavailable (ENOENT)'
        : typeof error.code === 'number' ? `process exited with code ${error.code}${detail ? ` (${detail})` : ''}`
          : error.killed === true || error.name === 'AbortError' ? 'process interrupted by timeout or cancellation' : 'process interrupted'))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  })
}

// One call of the grader CLI. It returns { value } with the structured_output that `accepts` takes, or { error } with a
// sanitized failure. Every caller shares this path, so the model, the account, the environment and the time limit stay equal.
async function attempt(prompt, schema, accepts, signal) {
  const directory = mkdtempSync(join(tmpdir(), 'astra-grader-'))
  try {
    const stdout = await runCli(prompt, schema, graderEnvironment(), directory, signal)
    const result = parsed(stdout)
    if (result?.type !== 'result') throw new GradeFailure('CLI result malformed')
    if (result.is_error !== false || result.subtype !== 'success') {
      throw new GradeFailure(`CLI result is an error${failedResult(result) ? ` (${failedResult(result)})` : ''}`)
    }
    if (!accepts(result.structured_output)) throw new GradeFailure('grade schema invalid')
    return { value: result.structured_output }
  } catch (failure) {
    const error = `Claude rubric grading failed: ${failure instanceof GradeFailure ? failure.message : 'process could not run'}.`
    process.stderr.write(`${error}\n`)
    return { error }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// One retry of a failed call, never of a cancelled one: the aborted signal would fail the retry at once.
export async function askClaude(prompt, { schema, accepts, signal }) {
  const first = await attempt(prompt, schema, accepts, signal)
  return first.error && !signal?.aborted ? attempt(prompt, schema, accepts, signal) : first
}

// The answers that the provider gives. promptfoo passes the `config` of a provider reference to the class constructor as
// options.config (createApiProvider, then the javascript provider factory of providers-*.js), so a caller names its answer
// with `config: { schema: 'half' }` and a rubric call names none.
const answers = { rubric: { schema: rubricSchema, accepts: isGrade }, half: { schema: halfSchema, accepts: () => true } }

// A promptfoo provider for llm-rubric and for the card question read: ORBIT_EVAL_GRADER=file://<absolute path>/claude-grader.mjs.
// It returns { output: "<JSON answer>" }, or { error } that promptfoo keeps as a grader error, so a failed call is no
// verdict and never a pass.
export default class ClaudeGrader {
  constructor(options) { this.answer = answers[options?.config?.schema ?? 'rubric'] }

  id() { return 'astra-claude-grader' }

  async callApi(prompt, _context, options) {
    if (!this.answer) return { error: 'Claude grading failed: the provider config names an unknown schema.' }
    const { value, error } = await askClaude(prompt, { ...this.answer, signal: options?.abortSignal })
    return error ? { error } : { output: JSON.stringify(value) }
  }
}
