/**
 * The one reader of .claude/orchestrator.json.
 *
 * WHY the staleness guard below exists, measured: a ticket that changed the codex default merged,
 * and the very next launch still started a worker on the old, more expensive model, because the
 * launcher read its copy out of a root working tree 26 commits behind on an already squash-merged
 * branch. Nothing was wrong with the config; the copy being read was. So a working copy that
 * DISAGREES with origin/<base> while the checkout does not contain origin/<base> is a refusal, not
 * a silent choice. A checkout that already contains origin/<base> is deliberately newer and wins,
 * otherwise every PR editing this config would turn the tool red.
 */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

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
  positive(config.timeouts?.hardCeilingMinutes, "timeouts.hardCeilingMinutes")
  positive(config.timeouts?.cloudCeilingMinutes, "timeouts.cloudCeilingMinutes")
  positive(config.timeouts?.cloudCommandMinutes, "timeouts.cloudCommandMinutes")
  positive(config.timeouts?.noProgressMinutes, "timeouts.noProgressMinutes")
  positive(config.timeouts?.pollSeconds, "timeouts.pollSeconds")
  positive(config.caps?.reviewFixAttempts, "caps.reviewFixAttempts")
  if (!Number.isInteger(config.caps?.cloudParallelTasks) || config.caps.cloudParallelTasks < 4 || config.caps.cloudParallelTasks > 8) {
    throw new Error(".claude/orchestrator.json caps.cloudParallelTasks must be an integer from 4 through 8")
  }
  if (!isRecord(config.cloud)) throw new Error(".claude/orchestrator.json must declare a cloud object")
  nonEmptyString(config.cloud.environmentId, "cloud.environmentId")
  validateTickets(config.tickets)
  return config
}

/**
 * `tier` is a plain string, not a label array. The tier:cheap / tier:deep label machinery is gone
 * with the wave planner that set it: one ticket, one worker, one model. D21 fixes the implementer
 * at gpt-5.6-sol @ high, so "default" is the only tier any launch resolves. The harness no longer
 * runs a reviewer of its own: Pullfrog reviews in GitHub Actions and publishes the
 * `pullfrog-approval` required check, so there is no second tier to declare.
 */
export const resolveWorkerInvocation = (engineName, engine, tier = "default") => {
  if (!isRecord(engine)) {
    throw new Error(`worker engine "${engineName}" is missing from .claude/orchestrator.json`)
  }
  if (
    !Array.isArray(engine.args) ||
    engine.args.some((argument) => typeof argument !== "string") ||
    engine.args.some((argument) => argument === "--model" || argument === "-m" || argument.startsWith("--model="))
  ) {
    throw new Error(`worker engine "${engineName}" must declare args as an array of non-model strings`)
  }
  const entry = engine.models?.[tier]
  if (!isRecord(entry) || typeof entry.model !== "string" || entry.model.trim().length === 0) {
    const declared = Object.keys(engine.models ?? {}).join(", ") || "none"
    throw new Error(`worker engine "${engineName}" has no valid models.${tier}; declared tiers: ${declared}`)
  }
  if (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((argument) => typeof argument !== "string"))) {
    throw new Error(`worker engine "${engineName}" models.${tier}.args must be an array of strings`)
  }
  return { tier, model: entry.model, args: [...engine.args, ...(entry.args ?? []), "--model", entry.model] }
}
