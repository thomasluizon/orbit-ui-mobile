/** The delivery driver's headless worker: its command, settings and environment, its clocks, and what its log says about how it stopped. */

import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runBounded } from "./bounded-process.mjs"
import { agentSkillFolders, blockLogFile, codexAccountOf, codexCommand, codexEnvironment, codexEvent, codexFinalResult, codexHomeDirectory, codexLogEvent, codexLogFinalResult, plainPrefixes, writeCodexHome } from "./codex-runner.mjs"
import { workerEnvironment } from "./config.mjs"
import { escapeRegex } from "./escape-regex.mjs"
import { GATE_TIMEOUT_SECONDS } from "./gate-commands.mjs"

/** The model of every worker launch, except the launch at a cap, which runs the coordinator model. */
export const WORKER_MODEL = "claude-sonnet-5-5"
/** The coordinator model: the owner session, the questions run and the harness review use it. */
export const COORDINATOR_MODEL = "claude-opus-5-5"
const EFFORT = "high"
const KEYCHAIN_ITEM = "orbit-worker-github-token"
const SKILL_KEPT_ON = "humanizer"
const PROBE_PROMPT = "reply ok"
const PROBE_TIMEOUT_MS = 120 * 1000
const HOOK_CHECK_TIMEOUT_MS = 5 * 60 * 1000
const KILL_GRACE_MS = 10 * 1000
const TAIL_BYTES = 256 * 1024
const READ_CHUNK_BYTES = 1024 * 1024
/** Skill folders sit at most three directories under the skills root: `synced/<account>/<skill>`. */
const SKILL_DEPTH = 3

/** The worker's clocks: a hard ceiling, a stall limit, a log cap and the sampling step. */
export const WORKER_LIMITS = Object.freeze({
  hardCeilingMs: 45 * 60 * 1000,
  noProgressMs: 10 * 60 * 1000,
  logCapBytes: 512 * 1024 * 1024,
  sampleMs: 30 * 1000,
})

/** What a worker, the questions run and the harness review may not run. Nothing here reaches production, and none of them merges. */
export const WORKER_DENY = Object.freeze([
  "Edit(**/.github/migration-contracts.json)",
  "Write(**/.github/migration-contracts.json)",
  "Edit(**/.github/migration-locks.json)",
  "Write(**/.github/migration-locks.json)",
  "Bash(render *)",
  "Bash(terraform *)",
  "Bash(aws *)",
  "Bash(stripe *)",
  "Bash(gh workflow *)",
  "Bash(gh secret *)",
  "Bash(gh pr merge*)",
  "Bash(gh api *merge*)",
  "Bash(gh api * -X *)",
  "Bash(gh api -X *)",
  "Bash(gh api * --method *)",
  "Bash(gh api --method *)",
  "Bash(gh auth *)",
  "Bash(env -u GH_TOKEN *)",
  "Bash(unset GH_TOKEN*)",
  "Bash(*GH_TOKEN=*)",
  "Bash(security *)",
])

/**
 * The tools that a worker never calls: they schedule, notify, trigger, sync a design, manage a worktree or an agent, edit a notebook,
 * or report review findings. `Task` and `AskUserQuestion` stay denied as before. Each name is a tool name of the installed claude CLI (2.1.332).
 */
export const WORKER_DENIED_TOOLS = Object.freeze([
  "Task", "AskUserQuestion", "CronCreate", "CronDelete", "CronList", "DesignSync", "EnterWorktree", "ExitWorktree", "ListAgents",
  "McpTaskCheck", "NotebookEdit", "PushNotification", "RemoteTrigger", "ReportFindings", "ScheduleWakeup", "SendMessage", "TaskStop", "Workflow",
])

/** The skills of the repository that a worker never uses, by name: the owner skills and the release, ticket and audit skills. */
export const WORKER_SKILLS_OFF = Object.freeze([
  "android-release", "audit-security", "dev-server", "driver", "flag", "investigate", "ios-release", "morning", "over-limit", "progress", "questions", "release", "sleep", "ticket",
])

/** The GitHub writes that a code worker may never run, and the questions run and the harness review may. The driver pushes and opens each pull request. The `gh` hook blocks every other write of a code worker. */
export const CODE_WORKER_DENY = Object.freeze([
  "Bash(git push*)",
  "Bash(gh pr create*)",
  "Bash(gh pr new*)",
  "Bash(gh pr close*)",
  "Bash(gh issue close*)",
  "Bash(gh issue comment*)",
  "Bash(gh issue edit*)",
])

const GH_HOOK = fileURLToPath(new URL("./worker-gh-hook.mjs", import.meta.url))
const SIZE_HOOK = fileURLToPath(new URL("./worker-size-hook.mjs", import.meta.url))
const GATE_HOOK = fileURLToPath(new URL("./worker-gate-hook.mjs", import.meta.url))
/** The tools that run a shell command in claude 2.1.332. */
const SHELL_TOOLS = "Bash|Monitor"
/** The tools that the size hook checks before they run. */
const SIZE_TOOLS = "Edit|Write|Bash|Monitor"
const shellQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`
const gateArguments = ({ run = null, head = null }) => `${run === null ? "" : ` --run ${shellQuoted(run)}`}${head === null ? "" : ` --head ${shellQuoted(head)}`}`

/**
 * The hook entries of a code worker: the GitHub hook and the size hook before a tool call, the size hook after every tool call,
 * and the gate hook when the worker stops. A hook that cannot run exits with a code that lets the call pass, so `|| exit 2`
 * blocks it. The gate hook has no `|| exit 2`: it writes its own record, and a stop that it cannot judge ends the run.
 * `gate` is `{ run, head }` (the launch and its head) or null for a run that writes no code.
 */
const ghHooks = (own, gate) => {
  const target = own === null ? "" : ` --worktree ${shellQuoted(own.worktree)} --branch ${shellQuoted(own.branch)}`
  const sizeHook = (event) => ({ type: "command", command: `node ${shellQuoted(SIZE_HOOK)} ${event} || exit 2`, timeout: 120 })
  return {
    PreToolUse: [
      { matcher: SHELL_TOOLS, hooks: [{ type: "command", command: `node ${shellQuoted(GH_HOOK)}${target} || exit 2`, timeout: 60 }] },
      { matcher: SIZE_TOOLS, hooks: [sizeHook("pre")] },
    ],
    PostToolUse: [{ matcher: "*", hooks: [sizeHook("post")] }],
    ...(gate === null ? {} : { Stop: [{ hooks: [{ type: "command", command: `node ${shellQuoted(GATE_HOOK)}${gateArguments(gate)}`, timeout: GATE_TIMEOUT_SECONDS }] }] }),
  }
}

/** The names of the skill folders under `skillsRoot`, the synced folders included: every directory that holds a SKILL.md. */
export const listSkillNames = (skillsRoot) => {
  const names = new Set()
  const walk = (directory, level) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      // A link to a folder counts as that folder, and a broken link is not a skill.
      let isDirectory = false
      try { isDirectory = statSync(path).isDirectory() } catch { continue }
      if (!isDirectory) continue
      if (existsSync(join(path, "SKILL.md"))) names.add(entry.name)
      else if (level < SKILL_DEPTH) walk(path, level + 1)
    }
  }
  walk(skillsRoot, 1)
  return [...names].sort()
}

/**
 * The `--settings` JSON. `skillOverrides` takes the values "on", "name-only", "user-invocable-only" and "off"
 * in claude 2.1.329 (its settings schema), and "off" hides a skill from the model and from its slash name.
 * A `codeWorker` gets the GitHub limits. `own` is its `{ worktree, branch }`: with null it may edit no pull request.
 * A `codeWorker` also gets the gate hook of the `Stop` event. `gate` is `{ run, head }`, or null for a `find` or `replan` run.
 */
export const workerSettings = ({ hotPath, skillNames, keepSkills = [SKILL_KEPT_ON], codeWorker = true, own = null, gate = {} }) => ({
  claudeMdExcludes: [hotPath],
  autoMemoryEnabled: false,
  outputStyle: "default",
  skillOverrides: Object.fromEntries([...new Set([...skillNames, ...WORKER_SKILLS_OFF])].filter((name) => !keepSkills.includes(name)).map((name) => [name, "off"])),
  permissions: { deny: [...WORKER_DENY, ...(codeWorker ? CODE_WORKER_DENY : [])] },
  ...(codeWorker ? { hooks: ghHooks(own, gate) } : {}),
})

/** The worker command. The order goes in on stdin, never in argv. */
export const workerCommand = (settingsJson, model = WORKER_MODEL) => ({
  executable: "claude",
  args: [
    "-p", "--model", model, "--effort", EFFORT, "--output-format", "stream-json", "--verbose", "--strict-mcp-config",
    "--permission-mode", "bypassPermissions", "--disallowed-tools", ...WORKER_DENIED_TOOLS, "--settings", settingsJson,
  ],
})

/** The command of a worker that resumes a session: the same arguments, the same model and settings, and `--resume <session id>`. The session keeps its id. */
export const resumeInvocation = (invocation, sessionId) => ({ ...invocation, command: { ...invocation.command, args: [...invocation.command.args, "--resume", sessionId] } })

/** A session whose context is over this many tokens starts cold: a resume would pay for the whole context again. */
export const RESUME_TOKEN_LIMIT = 200_000

/** The longest directory name that claude derives from a path. A longer path gets a hash suffix that is not read here. */
const PROJECT_NAME_LIMIT = 200

/**
 * The transcript file of a session: `<config directory>/projects/<working directory>/<session id>.jsonl`. The directory name is the
 * real path of the working directory with each character outside letters and digits changed to `-`. Null for a path that is too long.
 */
export const sessionFile = ({ configDirectory, worktree, sessionId }) => {
  let real = worktree
  try { real = realpathSync(worktree) } catch { /* a worktree that is gone keeps its given path */ }
  const name = real.replace(/[^A-Za-z0-9]/g, "-")
  return name.length > PROJECT_NAME_LIMIT ? null : join(configDirectory, "projects", name, `${sessionId}.jsonl`)
}

/** True when the transcript of the session is on disk, so `--resume` finds it. */
export const sessionExists = (options) => {
  const file = sessionFile(options)
  return file !== null && existsSync(file)
}

/** The main-account environment plus the worker's own switches and its GitHub token. `BRAIN_SESSION_CAPTURE` makes the user SessionEnd hook skip the brain capture of a worker session. */
export const workerEnvironmentFor = (parentEnvironment, token) => {
  if (typeof token !== "string" || token === "") throw new Error("a worker needs a GitHub token")
  const environment = {
    ...workerEnvironment(parentEnvironment),
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
    BRAIN_SESSION_CAPTURE: "1",
    GH_TOKEN: token,
  }
  if (parentEnvironment.CLAUDE_CODE_TMPDIR) environment.CLAUDE_CODE_TMPDIR = parentEnvironment.CLAUDE_CODE_TMPDIR
  return environment
}

/** The worker token from the Keychain, or null when the item is missing. The token is never logged. */
export const readWorkerToken = async ({ run = runBounded } = {}) => {
  const result = await run("security", ["find-generic-password", "-s", KEYCHAIN_ITEM, "-w"], { timeoutMs: 15 * 1000 })
  const token = typeof result.stdout === "string" ? result.stdout.trim() : ""
  return result.status === 0 && token !== "" ? token : null
}

/** The variables that make `gh auth token` print an environment token in place of the keyring login. */
const GH_TOKEN_VARIABLES = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]

/**
 * The owner's own `gh` login from its keyring, or null when there is none. The worker token sees only the code repositories,
 * so the questions run needs this one to read `thomasluizon/orbit-tickets`. The token variables leave the environment of the read,
 * because `gh auth token` prints one of them first when it is set. The token is never logged.
 */
export const readOwnerToken = async ({ run = runBounded, parentEnvironment = process.env } = {}) => {
  const env = { ...parentEnvironment }
  for (const name of GH_TOKEN_VARIABLES) delete env[name]
  const result = await run("gh", ["auth", "token", "--hostname", "github.com"], { env, timeoutMs: 15 * 1000 })
  const token = typeof result.stdout === "string" ? result.stdout.trim() : ""
  return result.status === 0 && token !== "" ? token : null
}

/** The config directory of the worker account: the second Claude login, beside the main one. */
export const workerConfigDirectory = (home) => join(home, ".claude-orbit-workers")

/** The environment of a `claude auth status` call on the worker account: the main-account environment plus its config directory. */
export const workerAccountEnvironment = (parentEnvironment, configDirectory) => ({ ...workerEnvironment(parentEnvironment), CLAUDE_CONFIG_DIR: configDirectory })

/**
 * The command and the environment of every worker run: a launch and a probe use the same ones. The main account has no
 * `configDirectory`. The worker account sets `CLAUDE_CONFIG_DIR` to its directory, and nothing else changes.
 */
export const workerInvocation = ({ home, parentEnvironment, token, configDirectory = null, model = WORKER_MODEL, keepSkills = [SKILL_KEPT_ON], codeWorker = true, own = null, gate = undefined }) => {
  const settings = workerSettings({ hotPath: join(home, "Developer", "brain", "hot.md"), skillNames: listSkillNames(join(home, ".claude", "skills")), keepSkills, codeWorker, own, gate })
  const environment = workerEnvironmentFor(parentEnvironment, token)
  if (configDirectory !== null) environment.CLAUDE_CONFIG_DIR = configDirectory
  return { command: workerCommand(JSON.stringify(settings), model), environment }
}

/**
 * The command and the environment of a Codex run: a launch with its `own` worktree and branch, or a probe in `cwd` with none.
 * `gate` is `{ run, head }` of a launch that writes code, and the `Stop` hook reads it from the environment.
 * Its `codex` member makes `probe` and `launch` write the worker home and read the Codex events.
 */
export const codexInvocation = ({ home, parentEnvironment, token, own = null, cwd = tmpdir(), gate = null }) => {
  const codexHome = codexHomeDirectory(home)
  return {
    command: codexCommand({ worktree: own?.worktree ?? cwd, skipGitCheck: own === null }),
    environment: codexEnvironment(workerEnvironmentFor(parentEnvironment, token), codexHome, own, gate),
    codex: { home: codexHome, skillsRoot: join(home, ".agents", "skills") },
  }
}

/**
 * The login of the Codex worker home, in the shape of `claude auth status --json`. `codex login status` exits 0 when logged in and 1
 * when not. A missing home is a signed-out login, and the check never creates it. The account comes from `auth.json`.
 */
export const codexLoginStatus = async ({ home, parentEnvironment, run = runBounded, read = readFileSync, exists = existsSync }) => {
  const codexHome = codexHomeDirectory(home)
  if (!exists(codexHome)) return { loggedIn: false }
  const result = await run("codex", ["login", "status"], { timeoutMs: 30 * 1000, env: codexEnvironment(workerEnvironment(parentEnvironment), codexHome) })
  if (result.status === 1) return { loggedIn: false }
  if (result.status !== 0) throw new Error(`codex login status gave exit ${result.status ?? "none"}${result.error ? `: ${result.error.message}` : ""}`)
  let account = null
  try { account = codexAccountOf(read(join(codexHome, "auth.json"), "utf8")) } catch { /* an unreadable file is no account */ }
  if (account === null) throw new Error("the Codex login has no readable account in auth.json")
  return { loggedIn: true, ...account }
}

/** Writes the files of the Codex worker home, which a launch and a probe do first. */
export const prepareCodexHome = ({ codex }) =>
  writeCodexHome({ codexHome: codex.home, hookPath: GH_HOOK, sizeHookPath: SIZE_HOOK, gateHookPath: GATE_HOOK, skillFolders: agentSkillFolders(codex.skillsRoot), denyPrefixes: plainPrefixes([...WORKER_DENY, ...CODE_WORKER_DENY]) })

/** The skills that stay on in a questions run: the one that it runs and the one that writes its comments. */
export const QUESTIONS_SKILLS = Object.freeze(["humanizer", "questions"])

/** The skills that stay on in the harness review: the one that re-plans and the one that writes its comments. */
export const HARNESS_REVIEW_SKILLS = Object.freeze(["humanizer", "ticket"])

/**
 * The command and the environment of a run on the coordinator model: the worker's settings without the GitHub limits of a code
 * worker, because it writes ticket bodies, comments and labels. The token is the owner's login, never the worker token.
 */
const coordinatorInvocation = ({ home, parentEnvironment, token }, keepSkills) => workerInvocation({ home, parentEnvironment, token, model: COORDINATOR_MODEL, keepSkills, codeWorker: false })

/** The questions run keeps the `questions` skill on. */
export const questionsInvocation = (options) => coordinatorInvocation(options, QUESTIONS_SKILLS)

/** The harness review keeps the `ticket` skill on. */
export const harnessReviewInvocation = (options) => coordinatorInvocation(options, HARNESS_REVIEW_SKILLS)

/**
 * The prefixes that the installed claude CLI (2.1.329) classifies as a reached usage limit. The CLI tags such a
 * subscriber 429 `api_error: "usage_limit_reached"`; a transient 429 does not match these.
 */
const LIMIT_PREFIXES = [
  "You've hit your",
  "You've reached your",
  "You're out of usage credits",
  "Your org is out of usage · add funds to continue",
  "Your org is out of usage · contact your admin",
  "Your seat type doesn't include usage credits",
  "Your seat type doesn't include usage",
  "Your usage allocation has been disabled by your admin",
  "Your group's usage limit is set to $0",
  "Fable 5 requires usage credits",
  "You're out of extra usage",
  "Your seat type doesn't include extra usage",
]
const LIMIT_PATTERNS = [/^(?:Fable|Haiku|Mythos|Opus|Sonnet)(?: [^·\n]{1,40})? requires usage credits\./]

export const isUsageLimitMessage = (text) => typeof text === "string" && (LIMIT_PREFIXES.some((prefix) => text.startsWith(prefix)) || LIMIT_PATTERNS.some((pattern) => pattern.test(text)))

const NEEDS_DECISION_LINE = /^NEEDS_DECISION: (\S.*)$/

/** The verdict for a run that did not stop at a limit or at sign-in. */
export const NO_STOP = Object.freeze({ usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null })

/** The question of the last line of a result, when that line is `NEEDS_DECISION: <question>`. */
const decisionOf = (resultText) => {
  if (typeof resultText !== "string") return null
  const lastLine = resultText.trimEnd().split("\n").at(-1)
  return NEEDS_DECISION_LINE.exec(lastLine)?.[1] ?? null
}

/**
 * The verdict of the last `type: "result"` line. A failed result carries the error text in `result`, and the CLI tags the
 * assistant message before it `error: "authentication_failed"` for a missing sign-in and for a 401 or 403.
 */
export const finalResult = (logText) => {
  let verdict = NO_STOP
  let apiError = null
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record?.type === "assistant") apiError = record.is_api_error_message === true ? record.error ?? null : null
    if (record?.type !== "result") continue
    const failed = record.is_error === true
    verdict = {
      usageLimitReached: failed && isUsageLimitMessage(record.result),
      authenticationFailed: failed && apiError === "authentication_failed",
      error: failed && typeof record.result === "string" ? record.result : null,
      needsDecision: failed ? null : decisionOf(record.result),
    }
    apiError = null
  }
  return verdict
}

/** The result line is the last one the CLI writes, so only the tail of a long log is read. */
export const logFinalResult = (logFile) => {
  let descriptor
  try {
    const size = statSync(logFile).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(logFile, "r")
    readSync(descriptor, buffer, 0, length, size - length)
    return finalResult(buffer.toString("utf8"))
  } catch {
    // A log that cannot be read proves no stop, and the caller still reports the exit.
    return NO_STOP
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/**
 * The session id and the newest `seven_day` reading of a stream-json log. `utilization` is a fraction and `resetsAt`
 * is epoch seconds. Both are null when the log holds no such event.
 */
export const readEvent = (logText) => {
  let sessionId = null
  let reading = null
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (sessionId === null && typeof record?.session_id === "string") sessionId = record.session_id
    if (record?.type !== "rate_limit_event") continue
    const info = record.rate_limit_info
    const window = info?.unifiedWindows?.seven_day
    if (typeof window?.utilization === "number" && Number.isFinite(window.utilization) && Number.isInteger(window.resetsAt)) {
      reading = { utilization: window.utilization, resetsAt: window.resetsAt, status: typeof info.status === "string" ? info.status : null }
    }
  }
  return { sessionId, utilization: reading?.utilization ?? null, resetsAt: reading?.resetsAt ?? null, status: reading?.status ?? null }
}

/** `readEvent` of a log file of any size: it keeps the first line with a session id and every event line, and reads the file in chunks. */
export const logEvent = (logFile) => {
  const kept = []
  let sessionSeen = false
  let descriptor
  try {
    descriptor = openSync(logFile, "r")
    const buffer = Buffer.alloc(READ_CHUNK_BYTES)
    let carry = ""
    for (let read = readSync(descriptor, buffer, 0, buffer.length, null); read > 0; read = readSync(descriptor, buffer, 0, buffer.length, null)) {
      const lines = (carry + buffer.toString("utf8", 0, read)).split("\n")
      carry = lines.pop()
      for (const line of lines) {
        const isEvent = line.includes('"type":"rate_limit_event"')
        if (isEvent || (!sessionSeen && line.includes('"session_id":"'))) {
          kept.push(line)
          sessionSeen = true
        }
      }
    }
    if (carry.includes('"type":"rate_limit_event"')) kept.push(carry)
  } catch {
    // A log that cannot be read holds no event.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  return readEvent(kept.join("\n"))
}

/** The tokens in the context of one `usage` object: the new input, the cache write and the cache read. Null when it has none. */
const contextTokens = (usage) => {
  const parts = [usage?.input_tokens, usage?.cache_creation_input_tokens, usage?.cache_read_input_tokens]
  return parts.every((value) => value === undefined || Number.isFinite(value)) && parts.some((value) => value !== undefined) ? parts.reduce((sum, value) => sum + (value ?? 0), 0) : null
}

/**
 * The size of the session context at the end of a stream-json log: the usage of the last `assistant` record. The `usage` of the
 * `result` record adds every turn, so it is not the context. Null when the log holds no such record or cannot be read.
 */
export const logContextTokens = (logFile) => {
  let last = null
  let descriptor
  try {
    descriptor = openSync(logFile, "r")
    const buffer = Buffer.alloc(READ_CHUNK_BYTES)
    let carry = ""
    const keep = (line) => { if (line.startsWith('{"type":"assistant"') && line.includes('"usage"')) last = line }
    for (let read = readSync(descriptor, buffer, 0, buffer.length, null); read > 0; read = readSync(descriptor, buffer, 0, buffer.length, null)) {
      const lines = (carry + buffer.toString("utf8", 0, read)).split("\n")
      carry = lines.pop()
      lines.forEach(keep)
    }
    keep(carry)
    return last === null ? null : contextTokens(JSON.parse(last).message?.usage)
  } catch {
    // A log that cannot be read holds no usage, and the session then starts cold.
    return null
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/**
 * The one-turn probe: the worker command, settings and environment and the prompt "reply ok". A reading, or null when there is
 * none. Claude takes one turn and prints the reading. Codex has no turn flag, and its reading is in the session file of its thread.
 */
export const probe = async ({ invocation, cwd = tmpdir(), run = runBounded } = {}) => {
  const { command, environment, codex = null } = invocation
  if (codex !== null) prepareCodexHome(invocation)
  const args = codex === null ? [...command.args, "--max-turns", "1"] : command.args
  const result = await run(command.executable, args, { cwd, env: environment, input: PROBE_PROMPT, timeoutMs: PROBE_TIMEOUT_MS })
  const output = typeof result.stdout === "string" ? result.stdout : ""
  const reading = codex === null ? readEvent(output) : codexEvent(output, codex.home)
  return reading.utilization === null ? null : reading
}

/** True when the block log gained a denial of `gh pr merge` from a call in `directory`, after its first `from` characters. */
const mergeBlockNoted = (logFile, from, directory) => {
  if (!existsSync(logFile)) return false
  return readFileSync(logFile, "utf8").slice(from).split("\n").filter(Boolean).some((line) => {
    const { cwd, reason } = JSON.parse(line)
    return cwd === directory && reason.includes("`gh pr merge`")
  })
}

/**
 * The hook step of the live check: one real Codex run that is told to merge a pull request. It passes only when the hook noted the
 * block of this run and the command never ran: a `gh` of the check leaves a marker file when it runs. That `gh` is first on `PATH`,
 * also in a zsh login shell, which moves the system directories to the front before it reads `.zprofile` of `ZDOTDIR`.
 */
export const codexHookCheck = async ({ home, parentEnvironment, token, repository, run = runBounded }) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "orbit-runner-check-")))
  try {
    const marker = join(directory, "gh-ran")
    const bin = join(directory, "bin")
    mkdirSync(bin)
    writeFileSync(join(bin, "gh"), `#!/bin/sh\n: > ${shellQuoted(marker)}\n`, { mode: 0o755 })
    writeFileSync(join(directory, ".zprofile"), `export PATH=${shellQuoted(bin)}:"$PATH"\n`)
    const invocation = codexInvocation({ home, parentEnvironment, token, cwd: directory })
    const environment = { ...invocation.environment, PATH: `${bin}${delimiter}${invocation.environment.PATH}`, ZDOTDIR: directory }
    prepareCodexHome(invocation)
    const blocks = blockLogFile(invocation.codex.home)
    const from = existsSync(blocks) ? readFileSync(blocks, "utf8").length : 0
    const order = `Run \`gh pr merge 1 --repo ${repository}\` one time and report its exit code. This tests a guard that blocks the command, so a block is the expected result. Run no other command.\n`
    const result = await run(invocation.command.executable, invocation.command.args, { cwd: directory, env: environment, input: order, timeoutMs: HOOK_CHECK_TIMEOUT_MS })
    if (existsSync(marker)) return { passed: false, reason: "`gh pr merge` ran, so the hook did not block it" }
    if (mergeBlockNoted(blocks, from, directory)) return { passed: true, reason: null }
    const failure = codexFinalResult(result.stdout ?? "").error ?? result.error?.message ?? `exit ${result.status}`
    return { passed: false, reason: `the hook noted no block of \`gh pr merge\` (${failure})` }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** The real clock. A test passes its own with the same five members. */
const SYSTEM_CLOCK = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
})

/** The newest file time under `directory`. `.git` and `node_modules` change without the worker. */
const newestMtime = (directory) => {
  let newest = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const path = join(directory, entry.name)
    try {
      newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs)
    } catch {
      // A path the worker removed during the walk is not progress.
    }
  }
  return newest
}

const headOf = async (worktree, run) => (await run("git", ["-C", worktree, "rev-parse", "HEAD"], { timeoutMs: 15 * 1000 })).stdout?.trim() ?? ""

/** A worker that edits without a commit moves only the file time, and one that commits a written tree moves only HEAD. */
const defaultFingerprint = async (worktree) => `${await headOf(worktree, runBounded)}:${newestMtime(worktree)}`

const killTree = (pid, signal) => {
  try {
    // The worker leads its own process group, so the negative pid reaches every child it started.
    process.kill(-pid, signal)
  } catch {
    // A group that is already gone is the goal.
  }
}

const defaultLogSize = (logFile) => {
  try { return statSync(logFile).size } catch { return null }
}

export const KILL_REASONS = Object.freeze({ "hard-ceiling": "passed its hard ceiling", "no-progress": "made no progress", "log-cap": "wrote past the log cap" })

/** Kills the whole process group of a worker. The driver calls it for a worker that it did not start. */
export const killWorkerTree = killTree

/** True when `pid` names a live process whose command line holds `claude` or `codex`. A pid file that outlives a reboot can name an unrelated process, which is never a worker. */
export const isWorkerProcess = (pid, { run = spawnSync } = {}) => {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const listed = run("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })
  return listed.status === 0 && /\b(?:claude|codex)\b/.test(listed.stdout ?? "")
}

/** The process ids that hold a worktree: a live driver pid file, or a process whose command line names the path. */
export const worktreeOccupants = (worktree, { stateDirectory, run = spawnSync, alive = isWorkerProcess, ownPid = process.pid }) => {
  const path = resolve(worktree)
  const pids = new Set()
  for (const name of readdirSync(stateDirectory).filter((entry) => entry.endsWith(".pid"))) {
    try {
      const file = JSON.parse(readFileSync(join(stateDirectory, name), "utf8"))
      if (resolve(file.worktree) === path && alive(file.pid)) pids.add(file.pid)
    } catch { /* a pid file that cannot be read names no worker */ }
  }
  const listed = run("ps", ["-axo", "pid,command"], { encoding: "utf8" })
  if (listed.status !== 0) throw new Error(`ps failed: ${(listed.stderr ?? "").trim()}`)
  const named = new RegExp(`${escapeRegex(path)}(?![\\w.-])`)
  for (const line of listed.stdout.split("\n")) {
    const [, pid, command] = /^\s*(\d+)\s+(.*)$/.exec(line) ?? []
    if (command !== undefined && Number(pid) !== ownPid && named.test(command)) pids.add(Number(pid))
  }
  return [...pids].sort((left, right) => left - right)
}

/** The pid and the working directory of every live process, from one `lsof -d cwd -Fpn` read. Each process shows as a `p<pid>` line, an `fcwd` line and an `n<path>` line. */
export const processDirectories = ({ run = spawnSync } = {}) => {
  const listed = run("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", timeout: 60 * 1000 })
  // lsof exits 1 when it could not read some process, so only an empty answer is a failure.
  if ((listed.stdout ?? "") === "") throw new Error(`lsof failed: ${(listed.stderr ?? "").trim() || `exit ${listed.status}`}`)
  const directories = []
  let pid = null
  for (const line of listed.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1))
    else if (line.startsWith("n") && pid !== null) directories.push({ pid, path: line.slice(1) })
  }
  return directories
}

/** The process ids whose working directory is the worktree or a path under it. The driver's own process never counts. */
export const directoryHolders = (directories, worktree, { ownPid = process.pid } = {}) => {
  const paths = new Set([resolve(worktree)])
  try { paths.add(realpathSync(worktree)) } catch { /* a worktree that is gone has no holder to find by its real path */ }
  const held = directories.filter(({ pid, path }) => pid !== ownPid && [...paths].some((root) => path === root || path.startsWith(`${root}/`)))
  return [...new Set(held.map(({ pid }) => pid))].sort((left, right) => left - right)
}

/**
 * The progress clocks of one worker: the log cap and the no-progress window. Each call samples once and returns the name of
 * the clock that fired, or null. `launch` samples it on a timer. The driver samples it each tick for a worker that it did
 * not start, so a restart of the driver leaves no worker without its clocks.
 */
export const progressWatch = ({ worktree, logFile, startedAt, clock = SYSTEM_CLOCK, limits = WORKER_LIMITS, fingerprint = defaultFingerprint, logSize = defaultLogSize }) => {
  let lastFingerprint = null
  let lastLogSize = 0
  let lastProgressAt = startedAt
  return async () => {
    const size = logSize(logFile) ?? 0
    if (size > limits.logCapBytes) return "log-cap"
    const print = await fingerprint(worktree)
    if (print !== lastFingerprint || size > lastLogSize) {
      lastFingerprint = print
      lastLogSize = size
      lastProgressAt = clock.now()
      return null
    }
    return clock.now() - lastProgressAt >= limits.noProgressMs ? "no-progress" : null
  }
}

/** The session id, the weekly reading and the verdict of the log of an ended worker. `codexHome` is the home of a Codex worker, and null for a Claude one. */
export const logOutcome = (logFile, codexHome = null) =>
  codexHome === null ? { ...logEvent(logFile), result: logFinalResult(logFile) } : { ...codexLogEvent(logFile, codexHome), result: codexLogFinalResult(logFile) }

/**
 * Starts one worker in `worktree`, writes `order` on its stdin and its stream-json to `logFile`, and resolves when it is gone.
 * A clock kills the whole process tree. The result holds the exit, the clock that killed it, the session id, the newest
 * `seven_day` reading and the final result verdict. The spawn, the kill, the fingerprint and the log size are seams.
 */
export const launch = ({ invocation, worktree, order, logFile, pidFile, clock = SYSTEM_CLOCK, limits = WORKER_LIMITS, spawnChild = spawn, kill = killTree, fingerprint = defaultFingerprint, logSize = defaultLogSize }) =>
  new Promise((resolve) => {
    const startedAt = clock.now()
    const logDescriptor = openSync(logFile, "a")
    let child
    try {
      if (invocation.codex) prepareCodexHome(invocation)
      child = spawnChild(invocation.command.executable, invocation.command.args, {
        cwd: worktree,
        env: invocation.environment,
        detached: true,
        stdio: ["pipe", logDescriptor, logDescriptor],
      })
    } catch (error) {
      closeSync(logDescriptor)
      resolve({ spawnError: error.message, exitCode: null, killed: null, sessionId: null, utilization: null, resetsAt: null, status: null, result: NO_STOP, durationMs: 0 })
      return
    }
    let killed = null
    let finished = false
    let escalation = null
    let sampling = false
    const watch = progressWatch({ worktree, logFile, startedAt, clock, limits, fingerprint, logSize })
    const stop = (clockName) => {
      if (killed !== null || finished) return
      killed = clockName
      kill(child.pid, "SIGTERM")
      escalation = clock.setTimeout(() => kill(child.pid, "SIGKILL"), KILL_GRACE_MS)
    }
    const ceiling = clock.setTimeout(() => stop("hard-ceiling"), limits.hardCeilingMs)
    const sample = async () => {
      if (sampling || killed !== null || finished) return
      sampling = true
      try {
        const fired = await watch()
        if (fired !== null) stop(fired)
      } finally {
        sampling = false
      }
    }
    const sampler = clock.setInterval(sample, limits.sampleMs)
    const finish = (exitCode, signal, spawnError = null) => {
      if (finished) return
      finished = true
      clock.clearTimeout(ceiling)
      clock.clearInterval(sampler)
      if (escalation !== null) clock.clearTimeout(escalation)
      // The worker's own exit does not end a child it left in the group.
      kill(child.pid, "SIGKILL")
      closeSync(logDescriptor)
      rmSync(pidFile, { force: true })
      resolve({ spawnError, exitCode, signal, killed, killReason: killed === null ? null : KILL_REASONS[killed], ...logOutcome(logFile, invocation.codex?.home), durationMs: clock.now() - startedAt })
    }
    child.on("error", (error) => finish(null, null, error.message))
    child.on("exit", (code, signal) => finish(code, signal))
    if (Number.isInteger(child.pid)) writeFileSync(pidFile, `${JSON.stringify({ pid: child.pid, worktree, startedAt: new Date(startedAt).toISOString() })}\n`)
    child.stdin?.on("error", () => { /* a worker that exits before it reads the order reports its own exit */ })
    child.stdin?.end(order)
  })

/** The reading that the snapshot of the status line holds, or null. Its `email` only names the account that took it, and nothing prints it. */
export const readSnapshot = (path) => {
  try {
    const snapshot = JSON.parse(readFileSync(path, "utf8"))
    const window = snapshot.rateLimits?.seven_day
    if (typeof window?.used_percentage !== "number" || !Number.isInteger(window.resets_at)) return null
    return { utilization: window.used_percentage / 100, resetsAt: window.resets_at, at: Date.parse(snapshot.at), email: snapshot.email ?? null }
  } catch {
    return null
  }
}

/** The first line of a failed log that is a usage-limit message, with the reset time it names; null when there is none. */
export const usageLimitIn = (logText, isLimit = isUsageLimitMessage) => {
  for (const line of logText.split("\n")) {
    const message = line.replace(/^.*?\d{4}-\d\d-\d\dT[\d:.]+Z /, "").trim()
    if (isLimit(message)) return { message, reset: /(?:resets?|until)\s+([^.\n·]+)/i.exec(message)?.[1]?.trim() ?? null }
  }
  return null
}
