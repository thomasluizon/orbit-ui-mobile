import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WORKER_ACCOUNT, workerAccountEnvironment, workerAccounts } from '../../tools/lib/orchestrator-config.mjs'

export const GRADER_MODEL = 'claude-opus-5-5'
export const GRADER_TIMEOUT_MILLISECONDS = 120000
const schema = readFileSync(new URL('./grader-schema.json', import.meta.url), 'utf8')
// The worker engine of the orchestrator: its command and the variable that names the worker account directory.
const engine = JSON.parse(readFileSync(new URL('../../.claude/orchestrator.json', import.meta.url), 'utf8')).workers.claude

// Print mode of the installed CLI, confirmed against a real call (claude-grader.test.mjs records its response): the grade
// comes back as structured_output of one JSON result. The grader reads no tool, MCP server, CLAUDE.md, hook or session.
export const graderArguments = ['-p', '--model', GRADER_MODEL, '--output-format', 'json', '--json-schema', schema,
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
function graderEnvironment() {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORBIT_EVAL_')))
  let account
  try {
    [account] = workerAccounts('claude', engine, environment)
  } catch {
    throw new GradeFailure(`${engine.configDirEnv} names no existing directory`)
  }
  if (account.name !== WORKER_ACCOUNT) throw new GradeFailure(`${engine.configDirEnv} is not set`)
  return workerAccountEnvironment(environment, account)
}

function runCli(prompt, environment, directory, signal) {
  return new Promise((resolve, reject) => {
    const child = execFile(engine.command, graderArguments, { cwd: directory, env: environment,
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

// A promptfoo provider for llm-rubric: ORBIT_EVAL_GRADER=file://claude-grader.mjs. It returns { output: "<JSON grade>" },
// or { error } that promptfoo keeps as a grader error, so a failed call is no verdict and never a pass.
export default class ClaudeGrader {
  id() { return 'astra-claude-grader' }

  async callApi(prompt, _context, options) {
    const first = await this.grade(prompt, options)
    return first.error ? this.grade(prompt, options) : first
  }

  async grade(prompt, options) {
    const directory = mkdtempSync(join(tmpdir(), 'astra-grader-'))
    try {
      const stdout = await runCli(prompt, graderEnvironment(), directory, options?.abortSignal)
      const result = parsed(stdout)
      if (result?.type !== 'result') throw new GradeFailure('CLI result malformed')
      if (result.is_error !== false || result.subtype !== 'success') {
        throw new GradeFailure(`CLI result is an error${failedResult(result) ? ` (${failedResult(result)})` : ''}`)
      }
      if (!isGrade(result.structured_output)) throw new GradeFailure('grade schema invalid')
      return { output: JSON.stringify(result.structured_output) }
    } catch (failure) {
      const error = `Claude rubric grading failed: ${failure instanceof GradeFailure ? failure.message : 'process could not run'}.`
      process.stderr.write(`${error}\n`)
      return { error }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
