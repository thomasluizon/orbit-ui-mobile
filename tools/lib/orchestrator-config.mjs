/** A checkout behind its configured base must not launch with a stale orchestrator config. */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { AUTO_COMPACT_TOKENS } from "./session-context.mjs"

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const DEFAULT_CONFIG_URL = new URL("../../.claude/orchestrator.json", import.meta.url)

const runGit = (cwd, args) => {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true })
  return { ok: !result.error && result.status === 0, stdout: (result.stdout ?? "").trim() }
}

/** Refuses only the case it can prove is wrong. No repository, or an unreadable base copy, means
 * there is nothing to have drifted from, so the working copy is the only copy there is. */
const assertNotStale = (configPath, baseBranch, workingText) => {
  const toplevel = runGit(dirname(configPath), ["rev-parse", "--show-toplevel"])
  if (!toplevel.ok) return
  const repoRoot = resolve(toplevel.stdout)
  const tracked = relative(repoRoot, configPath).replaceAll("\\", "/")
  const ref = `origin/${baseBranch}`
  const shown = runGit(repoRoot, ["show", `${ref}:${tracked}`])
  // Compare content, not line endings. `git show` always emits LF while a Windows working copy
  // checks out CRLF, so a byte comparison called every redesign-branch checkout stale and blocked
  // the tool harness on a difference that does not exist.
  const normalize = (text) => text.split("\r\n").join("\n").trim()
  if (!shown.ok || normalize(shown.stdout) === normalize(workingText)) return
  if (runGit(repoRoot, ["merge-base", "--is-ancestor", ref, "HEAD"]).ok) return
  throw new Error(
    `${tracked} disagrees with ${ref} and this checkout does not contain ${ref}, so the working copy ` +
      `may be the stale one. Run: git fetch origin ${baseBranch} && git merge --ff-only ${ref}`,
  )
}

const positive = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`.claude/orchestrator.json ${name} must be a positive number`)
  return value
}

const nonEmptyString = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`.claude/orchestrator.json ${name} must be a non-empty string`)
  }
  return value
}

const TICKET_STATUSES = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled", "Duplicate"]
const TICKET_STATE_KEYS = ["working", "review", "done"]
const TICKET_STATES = { working: "In Progress", review: "In Review", done: "Done" }

const validateTickets = (tickets) => {
  if (!isRecord(tickets)) throw new Error(".claude/orchestrator.json must declare a tickets object")
  nonEmptyString(tickets.repository, "tickets.repository")
  if (!Array.isArray(tickets.standing) || tickets.standing.some((number) => !Number.isInteger(number) || number <= 0) || new Set(tickets.standing).size !== tickets.standing.length) {
    throw new Error(".claude/orchestrator.json tickets.standing must be an array of unique positive ticket numbers")
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(tickets.repository)) {
    throw new Error(".claude/orchestrator.json tickets.repository must be an owner/repository slug")
  }
  nonEmptyString(tickets.projectOwner, "tickets.projectOwner")
  if (!Number.isInteger(tickets.projectNumber) || tickets.projectNumber <= 0) {
    throw new Error(".claude/orchestrator.json tickets.projectNumber must be a positive integer")
  }
  nonEmptyString(tickets.projectId, "tickets.projectId")
  nonEmptyString(tickets.statusFieldId, "tickets.statusFieldId")
  if (!isRecord(tickets.statusOptions)) {
    throw new Error(".claude/orchestrator.json tickets.statusOptions must be an object")
  }
  const optionNames = Object.keys(tickets.statusOptions)
  const missingOptions = TICKET_STATUSES.filter((status) => !optionNames.includes(status))
  const extraOptions = optionNames.filter((status) => !TICKET_STATUSES.includes(status))
  if (missingOptions.length > 0 || extraOptions.length > 0) {
    throw new Error(
      `.claude/orchestrator.json tickets.statusOptions must declare exactly ${TICKET_STATUSES.join(", ")}; ` +
        `missing: ${missingOptions.join(", ") || "none"}; extra: ${extraOptions.join(", ") || "none"}`,
    )
  }
  const optionIds = TICKET_STATUSES.map((status) => nonEmptyString(tickets.statusOptions[status], `tickets.statusOptions.${status}`))
  if (new Set(optionIds).size !== optionIds.length) {
    throw new Error(".claude/orchestrator.json tickets.statusOptions values must be unique")
  }
  if (!isRecord(tickets.states)) throw new Error(".claude/orchestrator.json tickets.states must be an object")
  const stateKeys = Object.keys(tickets.states)
  if (stateKeys.length !== TICKET_STATE_KEYS.length || TICKET_STATE_KEYS.some((key) => !stateKeys.includes(key))) {
    throw new Error(`.claude/orchestrator.json tickets.states must declare exactly ${TICKET_STATE_KEYS.join(", ")}`)
  }
  for (const key of TICKET_STATE_KEYS) {
    const status = nonEmptyString(tickets.states[key], `tickets.states.${key}`)
    if (status !== TICKET_STATES[key]) {
      throw new Error(`.claude/orchestrator.json tickets.states.${key} must be ${JSON.stringify(TICKET_STATES[key])}`)
    }
  }
}

export const readOrchestratorConfig = (configUrl = DEFAULT_CONFIG_URL, baseBranch = "main") => {
  const configPath = fileURLToPath(configUrl)
  let text
  try {
    text = readFileSync(configPath, "utf8")
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read: ${error.message}`)
  }
  assertNotStale(configPath, baseBranch, text)
  let config
  try {
    config = JSON.parse(text)
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read as JSON: ${error.message}`)
  }
  if (!isRecord(config) || !isRecord(config.workers)) {
    throw new Error(".claude/orchestrator.json must declare a workers object")
  }
  if (!isRecord(config.workers[config.worker])) {
    throw new Error(`.claude/orchestrator.json worker "${config.worker}" is not one of its workers`)
  }
  if (!isRecord(config.classifier)) throw new Error(".claude/orchestrator.json must declare a classifier object")
  if (!isRecord(config.relay) || typeof config.relay.enabled !== "boolean") {
    throw new Error(".claude/orchestrator.json relay.enabled must be a boolean")
  }
  // A relay that starts at or above the auto-compact point never beats the compaction it exists to replace.
  if (!Number.isInteger(config.relay.softTokens) || config.relay.softTokens < 150000 || config.relay.softTokens >= AUTO_COMPACT_TOKENS) {
    throw new Error(`.claude/orchestrator.json relay.softTokens must be an integer from 150000 up to, not including, ${AUTO_COMPACT_TOKENS}`)
  }
  if (!Number.isInteger(config.relay.hardTokens) || config.relay.hardTokens <= config.relay.softTokens || config.relay.hardTokens >= AUTO_COMPACT_TOKENS) {
    throw new Error(`.claude/orchestrator.json relay.hardTokens must be an integer above relay.softTokens and below ${AUTO_COMPACT_TOKENS}`)
  }
  nonEmptyString(config.classifier.model, "classifier.model")
  positive(config.timeouts?.hardCeilingMinutes, "timeouts.hardCeilingMinutes")
  positive(config.timeouts?.cloudCeilingMinutes, "timeouts.cloudCeilingMinutes")
  positive(config.timeouts?.cloudCommandMinutes, "timeouts.cloudCommandMinutes")
  positive(config.timeouts?.gitRemoteSeconds, "timeouts.gitRemoteSeconds")
  positive(config.timeouts?.receiptLockSeconds, "timeouts.receiptLockSeconds")
  positive(config.timeouts?.noProgressMinutes, "timeouts.noProgressMinutes")
  positive(config.timeouts?.pollSeconds, "timeouts.pollSeconds")
  positive(config.caps?.reviewFixAttempts, "caps.reviewFixAttempts")
  for (const name of ["maxOpenPullRequests", "maxQueuedRuns"]) {
    if (!Number.isInteger(config.caps?.[name]) || config.caps[name] <= 0) {
      throw new Error(`.claude/orchestrator.json caps.${name} must be a positive integer`)
    }
  }
  if (!Number.isInteger(config.caps?.workerLaunchesPerBranch) || config.caps.workerLaunchesPerBranch <= 0) {
    throw new Error(".claude/orchestrator.json caps.workerLaunchesPerBranch must be a positive integer")
  }
  if (!Number.isInteger(config.caps?.cloudParallelTasks) || config.caps.cloudParallelTasks < 4 || config.caps.cloudParallelTasks > 8) {
    throw new Error(".claude/orchestrator.json caps.cloudParallelTasks must be an integer from 4 through 8")
  }
  if (!isRecord(config.cloud)) throw new Error(".claude/orchestrator.json must declare a cloud object")
  if (typeof config.cloud.enabled !== "boolean") {
    throw new Error(".claude/orchestrator.json cloud.enabled must be a boolean")
  }
  nonEmptyString(config.cloud.environmentId, "cloud.environmentId")
  const cloudRepositoryKey = nonEmptyString(config.cloud.repositoryKey, "cloud.repositoryKey")
  if (!isRecord(config.repos) || typeof config.repos[cloudRepositoryKey] !== "string") {
    throw new Error(`.claude/orchestrator.json cloud.repositoryKey must name a configured repository (${cloudRepositoryKey})`)
  }
  nonEmptyString(config.repos[cloudRepositoryKey], `repos.${cloudRepositoryKey}`)
  validateTickets(config.tickets)
  const commonDir = runGit(dirname(configPath), ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  const primaryRoot = commonDir.ok ? dirname(commonDir.stdout) : resolve(dirname(configPath), "..")
  config.repos = Object.fromEntries(Object.entries(config.repos).map(([key, path]) => [key, typeof path === "string" ? resolve(primaryRoot, path) : path]))
  return config
}

/** The worker account's directory, and the main account: the orchestrator's default Claude config. */
export const WORKER_ACCOUNT = "worker"
export const MAIN_ACCOUNT = "main"

const isModelFlag = (argument) => argument === "--model" || argument === "-m" || argument.startsWith("--model=")

/**
 * `models` holds the standard model of each tier. `fableAccounts` names the accounts that run
 * `fableModels` instead, so adding or removing one account name is the only edit that turns Fable
 * on or off for that account. A null account name, as in a bare tier lookup, always reads `models`.
 */
const modelsForAccount = (engineName, engine, accountName) => {
  const { fableAccounts, fableModels } = engine
  if (fableAccounts === undefined && fableModels === undefined) return engine.models
  const known = [WORKER_ACCOUNT, MAIN_ACCOUNT]
  if (!Array.isArray(fableAccounts) || fableAccounts.some((name) => !known.includes(name)) || new Set(fableAccounts).size !== fableAccounts.length) {
    throw new Error(`worker engine "${engineName}" fableAccounts must be an array of unique account names from: ${known.join(", ")}`)
  }
  if (!isRecord(fableModels)) throw new Error(`worker engine "${engineName}" fableModels must be an object keyed by tier`)
  const missingTiers = Object.keys(engine.models ?? {}).filter((name) => !isRecord(fableModels[name]))
  if (missingTiers.length > 0) {
    throw new Error(`worker engine "${engineName}" fableModels must declare every tier of models; missing: ${missingTiers.join(", ")}`)
  }
  return fableAccounts.includes(accountName) ? fableModels : engine.models
}

/**
 * `tier` is a plain string, not a label array. The caller chooses the configured profile for the
 * order in front of it; the resolver owns the one argument path shared by every tier. `accountName`
 * is the account that runs the order, which can change the model but never the other arguments.
 */
export const resolveWorkerInvocation = (engineName, engine, tier = "default", accountName = null) => {
  if (!isRecord(engine)) {
    throw new Error(`worker engine "${engineName}" is missing from .claude/orchestrator.json`)
  }
  if (!Array.isArray(engine.args) || engine.args.some((argument) => typeof argument !== "string") || engine.args.some(isModelFlag)) {
    throw new Error(`worker engine "${engineName}" must declare args as an array of non-model strings`)
  }
  const subagentOffArgs = engine.subagentOffArgs ?? []
  if (!Array.isArray(subagentOffArgs) || subagentOffArgs.some((argument) => typeof argument !== "string" || isModelFlag(argument))) {
    throw new Error(`worker engine "${engineName}" subagentOffArgs must be an array of non-model strings`)
  }
  const models = modelsForAccount(engineName, engine, accountName)
  const entry = models?.[tier]
  if (!isRecord(entry) || typeof entry.model !== "string" || entry.model.trim().length === 0) {
    const declared = Object.keys(models ?? {}).join(", ") || "none"
    throw new Error(`worker engine "${engineName}" has no valid models.${tier}; declared tiers: ${declared}`)
  }
  if (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((argument) => typeof argument !== "string"))) {
    throw new Error(`worker engine "${engineName}" models.${tier}.args must be an array of strings`)
  }
  return { tier, model: entry.model, args: [...engine.args, ...subagentOffArgs, ...(entry.args ?? []), "--model", entry.model] }
}

/**
 * Every variable the installed claude CLI (2.1.318) selects ahead of the sign-in in its config
 * directory, copied from its source: its credential list, OAuth refresh variable, credential file
 * descriptors, authorization headers, and the provider selectors that leave the Anthropic account.
 */
export const CLAUDE_ACCOUNT_OVERRIDE_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
  "ANTHROPIC_AWS_API_KEY",
  "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
  "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
  "CLAUDE_CODE_GATEWAY_TOKEN_FILE_DESCRIPTOR",
  "CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR",
  "CCR_AGENT_PROXY_TOKEN_FILE_DESCRIPTOR",
  "ANTHROPIC_CUSTOM_HEADERS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
  "CLAUDE_CODE_USE_MANTLE",
]

/**
 * The accounts a launch runs under: the first runs the order, the second takes the one relaunch
 * after a usage limit. The config names only the variable; the path lives in the environment. Set,
 * it gives the worker account, then the main account. Unset or empty, single-account mode gives the
 * main account alone. An engine with no Claude account gets an empty list.
 */
export const workerAccounts = (engineName, engine, environment = process.env) => {
  if (engineName !== "claude") return []
  const variable = nonEmptyString(engine?.configDirEnv, `workers.${engineName}.configDirEnv`)
  const mainAccount = { name: MAIN_ACCOUNT, configDirectory: null }
  const directory = environment[variable]
  if (typeof directory !== "string" || directory.trim() === "") return [mainAccount]
  const resolved = resolve(directory)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`${variable} names ${resolved}, which is not an existing directory; unset it to run workers on the main account`)
  }
  return [{ name: WORKER_ACCOUNT, configDirectory: resolved }, mainAccount]
}

/**
 * The environment a claude child runs under for one account. Every inherited override is removed,
 * so the sign-in in the chosen config directory is the only credential the child can select. The
 * worker account names its directory; the main account removes CLAUDE_CONFIG_DIR, so the child
 * reads the default Claude config. A null account is an engine with no Claude account.
 */
export const workerAccountEnvironment = (environment, account) => {
  if (account === null) return environment
  const scoped = { ...environment }
  for (const key of CLAUDE_ACCOUNT_OVERRIDE_KEYS) delete scoped[key]
  if (account.name === WORKER_ACCOUNT) scoped.CLAUDE_CONFIG_DIR = account.configDirectory
  else delete scoped.CLAUDE_CONFIG_DIR
  return scoped
}

/**
 * The launch vector of every tier under every account the engine can run, for the calibration stamp.
 * An engine with no Claude account has none, so its stamp carries an empty object.
 */
export const workerAccountTiers = (engineName, engine) => {
  if (engineName !== "claude") return {}
  const tiers = Object.keys(engine?.models ?? {}).sort()
  return Object.fromEntries([WORKER_ACCOUNT, MAIN_ACCOUNT].map((accountName) => [
    accountName,
    Object.fromEntries(tiers.map((tier) => {
      const { model, args } = resolveWorkerInvocation(engineName, engine, tier, accountName)
      return [tier, { model, args }]
    })),
  ]))
}
