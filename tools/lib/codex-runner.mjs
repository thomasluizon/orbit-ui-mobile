/**
 * The Codex runner of the delivery driver's worker slots: its command, its private home, the account of its login, what a
 * `codex exec --json` log says about how it stopped, and the weekly reading of its session file. Nothing here starts a process.
 */

import { closeSync, mkdirSync, openSync, readdirSync, readSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** The model of every Codex worker launch and its effort, in one place. The owner changes the model here after a pilot. */
export const CODEX_MODEL = "gpt-6.2-sol"
export const CODEX_EFFORT = "high"

const NEEDS_DECISION_LINE = /^NEEDS_DECISION: (\S.*)$/
const WEEK_MINUTES = 10080
const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 2 * 1024 * 1024
/** The files of the worker home that the driver writes. `auth.json` is not one of them. */
const HOME_FILES = Object.freeze({ config: "config.toml", hooks: "hooks.json", rules: join("rules", "default.rules"), blocks: "hook-blocks.log" })
/** A key or a token in one of these variables replaces the ChatGPT login of the worker home. */
const LOGIN_OVERRIDES = new Set(["CODEX_API_KEY", "CODEX_ACCESS_TOKEN"])

/** The private Codex home of the worker slots: the second login, beside the default one. */
export const codexHomeDirectory = (home) => join(home, ".codex-orbit-workers")

/** The file of the worker home where the `gh` hook notes each call that it blocks. */
export const blockLogFile = (codexHome) => join(codexHome, HOME_FILES.blocks)

/** The command of a Codex worker. The order goes in on stdin (`-`), never in argv, and every flag comes before any `resume`. */
export const codexCommand = ({ worktree, skipGitCheck = false }) => ({
  executable: "codex",
  args: [
    "exec", "--json", "-C", worktree, "-m", CODEX_MODEL, "-c", `model_reasoning_effort="${CODEX_EFFORT}"`,
    ...(skipGitCheck ? ["--skip-git-repo-check"] : []),
    "--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust", "-",
  ],
})

/**
 * The environment of a Codex worker: the worker environment, without any `CLAUDE_*` variable or login override, plus `CODEX_HOME`.
 * `own` is the `{ worktree, branch }` of a launch. The `gh` hook reads them from the environment of the `codex` process,
 * which no command of the worker changes.
 */
export const codexEnvironment = (workerEnvironment, codexHome, own = null) => {
  const environment = { ...workerEnvironment, CODEX_HOME: codexHome }
  for (const key of Object.keys(environment)) if (key.startsWith("CLAUDE_") || key.startsWith("ORBIT_WORKER_") || LOGIN_OVERRIDES.has(key)) delete environment[key]
  return own === null ? environment : { ...environment, ORBIT_WORKER_WORKTREE: own.worktree, ORBIT_WORKER_BRANCH: own.branch }
}

const tomlString = (text) => JSON.stringify(text)

/** `config.toml` of the worker home: the file login store, the `CLAUDE.md` fallback, no bundled skill, no owner skill, no MCP server and no extra instruction. */
export const codexConfigToml = ({ skillFolders }) => [
  'cli_auth_credentials_store = "file"',
  'project_doc_fallback_filenames = ["CLAUDE.md"]',
  "",
  "[skills.bundled]",
  "enabled = false",
  ...skillFolders.flatMap((name) => ["", "[[skills.config]]", `name = ${tomlString(name)}`, "enabled = false"]),
  "",
].join("\n")

/**
 * `hooks.json` of the worker home. One hook serves every worker at once: its shell reads the worktree and the branch of the
 * calling worker from the environment. The `cwd` of a call is the `workdir` that the model chose, so it names no worker.
 * Only a hook of this home fires in a linked worktree.
 */
export const codexHooksJson = ({ hookPath, blockLogPath }) => {
  const command = `node ${shellQuoted(hookPath)} --worktree "\${ORBIT_WORKER_WORKTREE-}" --branch "\${ORBIT_WORKER_BRANCH-}" --block-log ${shellQuoted(blockLogPath)} || exit 2`
  return `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 60 }] }] } }, null, 2)}\n`
}

const shellQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`

/** The plain command prefixes of a deny list of `Bash(<words> *)` patterns: lower-case words only, so a flag, a variable or a wildcard inside the prefix drops the rule. */
export const plainPrefixes = (denyPatterns) => denyPatterns.flatMap((pattern) => {
  const prefix = /^Bash\((.*?)[ ]?\*?\)$/.exec(pattern)?.[1]
  return prefix !== undefined && /^[a-z]+( [a-z]+)*$/.test(prefix) ? [prefix.split(" ")] : []
})

/** `rules/default.rules`: one forbidden prefix rule for each plain prefix. A second layer only, because a rule misses a script with a substitution. */
export const codexRules = (prefixes) => `${prefixes.map((words) => `prefix_rule(pattern=${JSON.stringify(words).replaceAll(",", ", ")}, decision="forbidden")`).join("\n")}\n`

const writeAtomic = (path, text) => {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, path)
}

/** Writes the files of the worker home before a launch or a probe, each one whole. It never touches `auth.json`. */
export const writeCodexHome = ({ codexHome, hookPath, skillFolders, denyPrefixes }) => {
  mkdirSync(join(codexHome, "rules"), { recursive: true })
  writeAtomic(join(codexHome, HOME_FILES.config), codexConfigToml({ skillFolders }))
  writeAtomic(join(codexHome, HOME_FILES.hooks), codexHooksJson({ hookPath, blockLogPath: blockLogFile(codexHome) }))
  writeAtomic(join(codexHome, HOME_FILES.rules), codexRules(denyPrefixes))
}

/** The folder names under `~/.agents/skills`: each one is a skill that the worker home turns off. */
export const agentSkillFolders = (skillsRoot) => {
  try {
    return readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name).sort()
  } catch {
    return []
  }
}

/** The account of a login, from `auth.json` of the Codex home: the ids and the plan, or null when the file or the token is unreadable. No token leaves this function. */
export const codexAccountOf = (authText) => {
  try {
    const { tokens } = JSON.parse(authText)
    const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"))
    const email = claims.email
    const orgId = tokens.account_id
    if (typeof email !== "string" || typeof orgId !== "string") return null
    const plan = claims["https://api.openai.com/auth"]?.chatgpt_plan_type
    return { orgId, email, subscriptionType: typeof plan === "string" ? plan : null }
  } catch {
    return null
  }
}

const LIMIT_TEXT = /hit your usage limit|is out of credits|spend cap/i
const SIGN_IN_TEXT = /\b401\b|refresh_token|log in\b|not logged in/i
const RESET_TEXT = /try again at\s+([^\n]+?)\.?\s*$/i

/** True for the message of a reached Codex usage limit. The words "hit your usage limit" follow a straight or a curly apostrophe, so the match starts after it. */
export const isCodexUsageLimit = (message) => typeof message === "string" && LIMIT_TEXT.test(message)

/** The clock time after "try again at" in a usage-limit message, or null. */
export const codexLimitReset = (message) => (typeof message === "string" ? RESET_TEXT.exec(message.split("\n")[0])?.[1]?.trim() ?? null : null)

const lastLineOf = (text) => (typeof text === "string" ? text.trimEnd().split("\n").at(-1) : "")

const parseLines = function* (logText) {
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    try { yield JSON.parse(line) } catch { /* a cut first line of a tail */ }
  }
}

/** The thread id of a log (`thread.started`), or null. */
export const codexSessionId = (logText) => {
  for (const record of parseLines(logText)) if (record?.type === "thread.started" && typeof record.thread_id === "string") return record.thread_id
  return null
}

/** The text of the last `agent_message` item of a log, or "". A failure after it leaves no result. */
export const codexResultText = (logText) => {
  let text = ""
  for (const record of parseLines(logText)) {
    if (record?.type === "item.completed" && record.item?.type === "agent_message" && typeof record.item.text === "string") text = record.item.text
    if (record?.type === "turn.failed") text = ""
  }
  return text
}

/** The same shape as the Claude verdict: a usage limit, a sign-in failure, the error text and a `NEEDS_DECISION` question. */
export const codexFinalResult = (logText) => {
  let failure = null
  for (const record of parseLines(logText)) {
    if (record?.type === "error" && typeof record.message === "string") failure = record.message
    else if (record?.type === "turn.failed") failure = typeof record.error?.message === "string" ? record.error.message : "the turn failed"
    else if (record?.type === "turn.completed") failure = null
  }
  const limit = isCodexUsageLimit(failure)
  return {
    usageLimitReached: limit,
    authenticationFailed: failure !== null && !limit && SIGN_IN_TEXT.test(failure),
    error: failure,
    needsDecision: failure === null ? NEEDS_DECISION_LINE.exec(lastLineOf(codexResultText(logText)))?.[1] ?? null : null,
  }
}

/**
 * The weekly reading of the newest `token_count` record of a session file. The window that lasts 10080 minutes is `secondary`
 * on a Plus login and `primary` on a Pro login, so it is chosen by its length and never by its name.
 */
export const codexWeeklyReading = (rolloutText) => {
  let reading = null
  for (const record of parseLines(rolloutText)) {
    const limits = record?.type === "event_msg" && record.payload?.type === "token_count" ? record.payload.rate_limits : null
    const window = [limits?.primary, limits?.secondary].find((entry) => entry?.window_minutes === WEEK_MINUTES)
    if (typeof window?.used_percent !== "number" || !Number.isInteger(window.resets_at)) continue
    reading = { utilization: window.used_percent / 100, resetsAt: window.resets_at, status: limits.rate_limit_reached_type == null ? "allowed" : "rejected" }
  }
  return reading
}

const readRange = (file, where) => {
  let descriptor
  try {
    const size = statSync(file).size
    const length = Math.min(size, where === "head" ? HEAD_BYTES : TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(file, "r")
    readSync(descriptor, buffer, 0, length, where === "head" ? 0 : size - length)
    return buffer.toString("utf8")
  } catch {
    return ""
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

const newestFirst = (names) => [...names].sort().reverse()

/** The session file of a thread: `sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl`, searched from the newest day. Null when none exists. */
export const rolloutFile = ({ codexHome, threadId }) => {
  const list = (directory) => { try { return readdirSync(directory, { withFileTypes: true }) } catch { return [] } }
  const sessions = join(codexHome, "sessions")
  for (const year of newestFirst(list(sessions).filter((entry) => entry.isDirectory()).map((entry) => entry.name))) {
    for (const month of newestFirst(list(join(sessions, year)).filter((entry) => entry.isDirectory()).map((entry) => entry.name))) {
      for (const day of newestFirst(list(join(sessions, year, month)).filter((entry) => entry.isDirectory()).map((entry) => entry.name))) {
        const found = list(join(sessions, year, month, day)).find((entry) => entry.name.startsWith("rollout-") && entry.name.endsWith(`-${threadId}.jsonl`))
        if (found !== undefined) return join(sessions, year, month, day, found.name)
      }
    }
  }
  return null
}

/** The session id and the weekly reading of a Codex output: the id from the output, the reading from the tail of the session file of that thread. */
export const codexEvent = (logText, codexHome) => {
  const sessionId = codexSessionId(logText)
  const file = sessionId === null ? null : rolloutFile({ codexHome, threadId: sessionId })
  const reading = file === null ? null : codexWeeklyReading(readRange(file, "tail"))
  return { sessionId, utilization: reading?.utilization ?? null, resetsAt: reading?.resetsAt ?? null, status: reading?.status ?? null }
}

/** `codexEvent` of a log file of any size: the thread starts in its head. */
export const codexLogEvent = (logFile, codexHome) => codexEvent(readRange(logFile, "head"), codexHome)

/** The log of a Codex worker is JSONL of the `codex exec --json` events: the last 256 KiB hold its end. */
export const codexLogFinalResult = (logFile) => codexFinalResult(readRange(logFile, "tail"))
