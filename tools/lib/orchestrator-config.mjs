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
  if (!shown.ok || shown.stdout === workingText.trim()) return
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
  for (const role of ["worker", "reviewer"]) {
    if (!isRecord(config.workers[config[role]])) {
      throw new Error(`.claude/orchestrator.json ${role} "${config[role]}" is not one of its workers`)
    }
  }
  positive(config.timeouts?.hardCeilingMinutes, "timeouts.hardCeilingMinutes")
  positive(config.timeouts?.noProgressMinutes, "timeouts.noProgressMinutes")
  positive(config.timeouts?.pollSeconds, "timeouts.pollSeconds")
  positive(config.caps?.reviewRounds, "caps.reviewRounds")
  return config
}

/**
 * `tier` is a plain string, not a label array. The tier:cheap / tier:deep label machinery is gone
 * with the wave planner that set it: one ticket, one worker, one model. D21 fixes the implementer
 * at gpt-5.6-sol @ high in BOTH normal and codex-only mode, so "default" is the only tier a worker
 * ever resolves; "review" exists for the codex-only reviewer at xhigh.
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
