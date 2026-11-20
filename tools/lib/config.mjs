/** The driver's reader of `.claude/orchestrator.json`, and the environment of a main-account claude child. */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPOSITORY_KEYS = ["ui", "api", "landing"]
const REQUIRED_STATUSES = ["Todo", "In Progress", "In Review", "Done"]

/**
 * Every variable that the installed claude CLI selects ahead of the sign-in in its config
 * directory: its credential list, OAuth refresh variable, credential file descriptors,
 * authorization headers and the provider selectors that leave the Anthropic account.
 */
const CLAUDE_ACCOUNT_OVERRIDE_KEYS = [
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

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`.claude/orchestrator.json ${name} must be a non-empty string`)
  return value
}

/** A copy of the environment that selects the main account: no account override and no config directory. */
export const workerEnvironment = (environment) => {
  const scoped = { ...environment }
  for (const key of CLAUDE_ACCOUNT_OVERRIDE_KEYS) delete scoped[key]
  delete scoped.CLAUDE_CONFIG_DIR
  return scoped
}

/** The primary checkout, so the driver finds the one configuration from any worktree of the repository. */
const primaryRoot = (directory) => {
  const result = spawnSync("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`git could not name the primary checkout of ${directory}: ${(result.stderr ?? "").trim()}`)
  return dirname(result.stdout.trim())
}

/** Reads only the keys the driver needs; every other key of the file is ignored. */
export const readDriveConfig = ({ directory = dirname(fileURLToPath(import.meta.url)) } = {}) => {
  const root = primaryRoot(directory)
  const path = resolve(root, ".claude", "orchestrator.json")
  let config
  try {
    config = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read at ${path}: ${error.message}`)
  }
  const { tickets, repos } = isRecord(config) ? config : {}
  if (!isRecord(tickets)) throw new Error(".claude/orchestrator.json must declare a tickets object")
  if (!/^[^/\s]+\/[^/\s]+$/.test(requireText(tickets.repository, "tickets.repository"))) {
    throw new Error(".claude/orchestrator.json tickets.repository must be an owner/repository slug")
  }
  for (const name of ["projectOwner", "projectId", "statusFieldId"]) requireText(tickets[name], `tickets.${name}`)
  if (!Number.isInteger(tickets.projectNumber) || tickets.projectNumber <= 0) throw new Error(".claude/orchestrator.json tickets.projectNumber must be a positive integer")
  if (!isRecord(tickets.statusOptions)) throw new Error(".claude/orchestrator.json tickets.statusOptions must be an object")
  for (const status of REQUIRED_STATUSES) requireText(tickets.statusOptions[status], `tickets.statusOptions.${status}`)
  if (!isRecord(repos)) throw new Error(".claude/orchestrator.json must declare a repos object")
  const resolved = Object.fromEntries(REPOSITORY_KEYS.map((key) => [key, resolve(root, requireText(repos[key], `repos.${key}`))]))
  return { tickets, repos: resolved }
}
