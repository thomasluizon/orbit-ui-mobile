/**
 * The one reader of .claude/orchestrator.json, and the reason a launch can no longer run on a
 * config the base branch has already moved past. Measured: the ticket that changed the codex
 * default merged, and the very next launch still started a worker on the old, more expensive
 * model, because the launcher read its copy out of a root working tree 26 commits behind on an
 * already squash-merged branch. Nothing was wrong with the config; the copy being read was.
 *
 * So the authority is `origin/<base>`, not the working tree, and a disagreement the checkout
 * cannot explain is a REFUSAL naming both values rather than a silent choice. The three branches
 * below are the whole decision, and each one is a different fact about the checkout:
 *
 *   no git repository        there is no committed copy to drift from, so the working copy is the
 *                            only copy there is. This is the staged-fixture and tarball case, not
 *                            the measured defect, which needs a remote to fall behind.
 *   HEAD contains origin/base  every commit on the base branch is already here, so any difference
 *                            is a deliberate local change and the working copy is the NEWER
 *                            authority. Without this branch every PR that edits the config would
 *                            turn every tool red, which is how a gate gets switched off.
 *   HEAD is behind origin/base a difference here may be the stale copy itself, and the reader
 *                            cannot tell which side is right, so it refuses and names both.
 *
 * A reader that fell back to the working copy on an unreadable ref would reintroduce the exact
 * defect, so an unresolvable `origin/<base>` fails CLOSED naming which read failed. It is fetched
 * once first, because a shallow CI checkout legitimately has no such remote-tracking ref yet.
 */

import { spawnSyncHidden as spawnSync } from "./subprocess-options.mjs"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const DEFAULT_CONFIG_URL = new URL("../../.claude/orchestrator.json", import.meta.url)

const runGit = (cwd, args) => {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true })
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    reason: (result.error?.message ?? result.stderr ?? "").toString().trim() || `git exited ${result.status}`,
  }
}

const parseConfig = (text, source) => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read as JSON from ${source}: ${error.message}`)
  }
}

/** Every leaf of the config as a `path -> JSON literal` map, so a refusal can name the exact
 * settings that disagree instead of printing two whole documents at the operator. */
const leavesOf = (value, path = "", into = new Map()) => {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) leavesOf(child, path ? `${path}.${key}` : key, into)
  } else {
    into.set(path, JSON.stringify(value))
  }
  return into
}

const namedDifferences = (baseConfig, workingConfig, baseLabel) => {
  const baseLeaves = leavesOf(baseConfig)
  const workingLeaves = leavesOf(workingConfig)
  const lines = []
  for (const key of new Set([...baseLeaves.keys(), ...workingLeaves.keys()].sort())) {
    const base = baseLeaves.get(key)
    const working = workingLeaves.get(key)
    if (base === working) continue
    lines.push(`  ${key}: ${baseLabel} has ${base ?? "no such setting"}, the working tree has ${working ?? "no such setting"}`)
  }
  return lines
}

/**
 * `origin/<base>` as a commit, fetching it exactly once if the checkout has never seen it. An
 * explicit refspec, because a shallow `actions/checkout` configures `remote.origin.fetch` for the
 * checked out ref alone and a bare `git fetch origin main` would land in FETCH_HEAD with no
 * remote-tracking ref created.
 */
const resolveBaseCommit = (repoRoot, baseBranch) => {
  const ref = `origin/${baseBranch}`
  const resolved = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
  if (resolved.ok) return ref
  const fetched = runGit(repoRoot, [
    "fetch", "--quiet", "--depth=1", "origin", `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`,
  ])
  const refetched = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
  if (refetched.ok) return ref
  throw new Error(
    `could not resolve ${ref} in ${repoRoot}, so .claude/orchestrator.json has no authoritative copy to read: ` +
      `git rev-parse ${ref} found nothing and git fetch origin ${baseBranch} did not create it (${fetched.ok ? "the fetch reported success" : fetched.reason}). ` +
      `Fetch the base branch before launching; the working-tree copy is not trusted on its own.`,
  )
}

/**
 * The config the tools act on: `origin/<base>`'s copy, or the working copy when the checkout is
 * provably newer than the base branch. Anything else throws.
 */
const authoritativeConfig = (configPath, baseBranch, workingConfig) => {
  const toplevel = runGit(dirname(configPath), ["rev-parse", "--show-toplevel"])
  if (!toplevel.ok) return workingConfig
  const repoRoot = resolve(toplevel.stdout)
  const trackedPath = relative(repoRoot, configPath).replaceAll("\\", "/")
  const ref = resolveBaseCommit(repoRoot, baseBranch)
  const shown = runGit(repoRoot, ["show", `${ref}:${trackedPath}`])
  if (!shown.ok) {
    throw new Error(
      `could not read ${trackedPath} from ${ref} in ${repoRoot}: git show ${ref}:${trackedPath} failed (${shown.reason}). ` +
        `The working-tree copy is not trusted on its own, so this launch stops here.`,
    )
  }
  const baseConfig = parseConfig(shown.stdout, `${ref}:${trackedPath}`)
  const differences = namedDifferences(baseConfig, workingConfig, ref)
  if (differences.length === 0) return baseConfig
  if (runGit(repoRoot, ["merge-base", "--is-ancestor", ref, "HEAD"]).ok) return workingConfig
  throw new Error(
    `${trackedPath} disagrees with ${ref}, and this checkout does not contain ${ref}, so the working-tree copy may be the stale one:\n` +
      `${differences.join("\n")}\n` +
      `Bring the checkout up to date (git fetch origin ${baseBranch} && git merge --ff-only ${ref}) before launching.`,
  )
}

const sameArgs = (first, second) =>
  first.length === second.length && first.every((argument, index) => argument === second[index])

const modelEntry = (engineName, models, tier) => {
  const entry = models[tier]
  if (
    !isRecord(entry) ||
    typeof entry.model !== "string" ||
    entry.model.trim().length === 0 ||
    (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((argument) => typeof argument !== "string")))
  ) {
    throw new Error(
      `worker engine "${engineName}" has an invalid models.${tier} mapping; expected { model: string, args?: string[] }`,
    )
  }
  return entry
}

const invocationFor = (baseArgs, entry) => [...baseArgs, ...(entry.args ?? []), "--model", entry.model]

export const readOrchestratorConfig = (configUrl = DEFAULT_CONFIG_URL, baseBranch = "main") => {
  const configPath = fileURLToPath(configUrl)
  let workingConfig
  try {
    workingConfig = JSON.parse(readFileSync(configPath, "utf8"))
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read as JSON: ${error.message}`)
  }
  const config = authoritativeConfig(configPath, baseBranch, workingConfig)
  if (!isRecord(config) || !Number.isInteger(config.maxParallelWorktrees) || config.maxParallelWorktrees < 1) {
    throw new Error(".claude/orchestrator.json maxParallelWorktrees must be a positive integer")
  }
  return config
}

export const resolveWorkerInvocation = (engineName, engine, labels) => {
  if (labels.includes("worker:sonnet")) {
    throw new Error('worker:sonnet is no longer supported; replace it with "tier:cheap"')
  }
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
  if (!isRecord(engine.models) || !Object.hasOwn(engine.models, "default")) {
    throw new Error(
      `worker engine "${engineName}" has an invalid models.default mapping; expected { model: string, args?: string[] }`,
    )
  }
  for (const requiredTier of ["cheap", "deep"]) {
    if (!Object.hasOwn(engine.models, requiredTier)) {
      throw new Error(`worker engine "${engineName}" is missing its models.${requiredTier} mapping`)
    }
  }

  const declaredTiers = Object.keys(engine.models).filter((tier) => tier !== "default")
  const entries = new Map(
    ["default", ...declaredTiers].map((tier) => [tier, modelEntry(engineName, engine.models, tier)]),
  )
  const tierLabels = [...new Set(labels.filter((label) => label.startsWith("tier:")))]
  if (tierLabels.length > 1) {
    throw new Error(`conflicting worker tier labels: ${tierLabels.join(", ")}`)
  }

  const tier = tierLabels[0]?.slice("tier:".length) ?? "default"
  if (!entries.has(tier)) {
    const available = declaredTiers.map((declaredTier) => `tier:${declaredTier}`).join(", ") || "none"
    throw new Error(
      `worker engine "${engineName}" does not declare tier:${tier}; declared tiers: ${available}`,
    )
  }

  const cheapArgs = entries.has("cheap") ? invocationFor(engine.args, entries.get("cheap")) : null
  const deepArgs = entries.has("deep") ? invocationFor(engine.args, entries.get("deep")) : null
  if (cheapArgs && deepArgs && sameArgs(cheapArgs, deepArgs)) {
    throw new Error(`worker engine "${engineName}" resolves tier:cheap and tier:deep to identical invocations`)
  }

  const args = invocationFor(engine.args, entries.get(tier))
  const defaultArgs = invocationFor(engine.args, entries.get("default"))
  if (tier !== "default" && sameArgs(args, defaultArgs)) {
    throw new Error(
      `worker engine "${engineName}" resolves tier:${tier} to the same invocation as its default model`,
    )
  }
  return { tier, args }
}
