import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { T, root, realOrchestratorConfig, stage, toolPath } from "./_harness.mjs"

const NAME = "orchestrator-config.mjs"

/** The message a caller would actually read, or null when the call returned. */
const thrown = (call) => {
  try {
    call()
    return null
  } catch (error) {
    return error.message
  }
}

const configUrl = (label, body) => pathToFileURL(stage(join("orchestrator-config", label, "orchestrator.json"), body))

/**
 * A repository whose .claude/orchestrator.json is committed twice, so the staleness guard has a
 * real `git show origin/<base>:<path>` to compare against. `head` selects which commit the
 * checkout sits on and `origin` which one the remote ref names, which is the only pair of knobs
 * the guard branches on.
 */
const stageConfigRepo = (label, { head, origin, working }) => {
  const path = join(root, "orchestrator-config-repo", label)
  mkdirSync(join(path, ".claude"), { recursive: true })
  const git = (args) => spawnSync("git", ["-C", path, ...args], { encoding: "utf8" })
  const configPath = join(path, ".claude", "orchestrator.json")
  const commits = {}
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"]]) {
    if (git(args).status !== 0) return null
  }
  for (const revision of ["base", "newer"]) {
    writeFileSync(configPath, `{"revision":"${revision}"}\n`)
    if (git(["add", ".claude/orchestrator.json"]).status !== 0 || git(["commit", "-q", "-m", revision]).status !== 0) return null
    commits[revision] = git(["rev-parse", "HEAD"]).stdout.trim()
  }
  if (git(["update-ref", "refs/remotes/origin/main", commits[origin]]).status !== 0) return null
  if (git(["reset", "-q", "--hard", commits[head]]).status !== 0) return null
  writeFileSync(configPath, working)
  return { path, configPath }
}

export const cases = async () => {
  const { readOrchestratorConfig, resolveWorkerInvocation } = await import(pathToFileURL(toolPath("lib/orchestrator-config.mjs")).href)

  for (const [label, args] of [
    ["--model", ["exec", "--model", "gpt-5.6-sol"]],
    ["-m", ["exec", "-m", "gpt-5.6-sol"]],
    ["--model=", ["exec", "--model=gpt-5.6-sol"]],
  ]) {
    const message = thrown(() => resolveWorkerInvocation("codex", { args, models: { default: { model: "gpt-5.6-sol" } } }))
    T(
      `${NAME}: an engine pinning the model with ${label} in args is refused`,
      /worker engine "codex" must declare args as an array of non-model strings/.test(message ?? ""),
      `resolveWorkerInvocation returned instead of throwing, or threw: ${message}`,
    )
  }
  T(
    `${NAME}: a non-string entry in args is refused`,
    /must declare args as an array of non-model strings/.test(thrown(() => resolveWorkerInvocation("codex", { args: ["exec", 7], models: { default: { model: "x" } } })) ?? ""),
    "an args array carrying a number resolved",
  )
  T(
    `${NAME}: a missing engine is refused by name`,
    /worker engine "ghost" is missing from \.claude\/orchestrator\.json/.test(thrown(() => resolveWorkerInvocation("ghost", undefined)) ?? ""),
    "an absent engine resolved",
  )

  const unknownTier = thrown(() => resolveWorkerInvocation("codex", { args: [], models: { default: { model: "a" }, review: { model: "b" } } }, "cheap"))
  T(
    `${NAME}: an unknown tier is refused naming the tiers that are declared`,
    /has no valid models\.cheap; declared tiers: default, review/.test(unknownTier ?? ""),
    `a caller cannot fix a tier typo without being told what exists; got: ${unknownTier}`,
  )
  T(
    `${NAME}: a tier whose args are not an array of strings is refused`,
    /models\.default\.args must be an array of strings/.test(thrown(() => resolveWorkerInvocation("codex", { args: [], models: { default: { model: "a", args: "high" } } })) ?? ""),
    "a string args value resolved",
  )

  /** The shipped config, so this asserts the real engine rather than a fixture agreeing with it. */
  const real = realOrchestratorConfig()
  const engineName = real.worker
  const engine = real.workers[engineName]
  const invocation = resolveWorkerInvocation(engineName, engine, "default")
  T(
    `${NAME}: resolves the declared tier, model, and a single appended --model`,
    invocation.tier === "default" &&
      invocation.model === engine.models.default.model &&
      JSON.stringify(invocation.args) === JSON.stringify([...engine.args, ...(engine.models.default.args ?? []), "--model", engine.models.default.model]),
    JSON.stringify(invocation),
  )
  T(
    `${NAME}: the shipped implementer is gpt-5.6-sol at high reasoning effort (D21)`,
    invocation.model === "gpt-5.6-sol" && invocation.args.includes('model_reasoning_effort="high"'),
    `.claude/orchestrator.json resolved ${invocation.model} with ${JSON.stringify(invocation.args)}`,
  )

  const readAndFail = (label, config) => thrown(() => readOrchestratorConfig(configUrl(label, JSON.stringify(config))))
  T(
    `${NAME}: a config with no workers object is refused`,
    /must declare a workers object/.test(readAndFail("no-workers", { worker: "codex" }) ?? ""),
    "a config with no workers was accepted",
  )
  T(
    `${NAME}: a worker naming no declared engine is refused`,
    /worker "ghost" is not one of its workers/.test(readAndFail("bad-worker", { ...real, worker: "ghost" }) ?? ""),
    "a worker key naming no engine was accepted",
  )
  T(
    `${NAME}: a reviewer naming no declared engine is refused`,
    /reviewer "ghost" is not one of its workers/.test(readAndFail("bad-reviewer", { ...real, reviewer: "ghost" }) ?? ""),
    "a reviewer key naming no engine was accepted",
  )
  for (const [label, key] of [["hardCeilingMinutes", "timeouts"]]) {
    const stripped = { ...real }
    delete stripped[key]
    T(
      `${NAME}: a config with no ${key} is refused naming ${key}.${label}`,
      new RegExp(`${key}\\.${label} must be a positive number`).test(readAndFail(`no-${key}`, stripped) ?? ""),
      `a config with no ${key} was accepted`,
    )
  }
  T(
    `${NAME}: a zero timeout is refused rather than read as "no clock"`,
    /timeouts\.noProgressMinutes must be a positive number/.test(readAndFail("zero-timeout", { ...real, timeouts: { ...real.timeouts, noProgressMinutes: 0 } }) ?? ""),
    "a zero no-progress clock was accepted",
  )
  T(
    `${NAME}: a zero connector fixer bound is refused rather than becoming unbounded`,
    /caps\.connectorFixAttempts must be a positive number/.test(readAndFail("zero-connector-fixes", { ...real, caps: { ...real.caps, connectorFixAttempts: 0 } }) ?? ""),
    "a zero connector fixer bound was accepted",
  )
  T(
    `${NAME}: an unreadable file is refused as unreadable, not as invalid JSON`,
    /could not be read: /.test(thrown(() => readOrchestratorConfig(pathToFileURL(join(root, "orchestrator-config", "absent.json")))) ?? ""),
    "a missing config did not report itself as missing",
  )
  T(
    `${NAME}: the shipped config is accepted when read from outside any repository`,
    readOrchestratorConfig(configUrl("shipped", JSON.stringify(real))).worker === real.worker,
    "the real config shape was refused by its own reader",
  )

  /**
   * The measured defect: a launcher read its config from a checkout 26 commits behind and started
   * a worker on the superseded model. A working copy that disagrees with origin/<base> is refused
   * ONLY when the checkout cannot already contain that ref, so a PR editing the config stays green.
   */
  const stale = stageConfigRepo("stale", { head: "base", origin: "newer", working: '{"revision":"local"}\n' })
  T(
    `${NAME}: a working copy behind origin/main is refused with the fetch command to repair it`,
    stale !== null &&
      /disagrees with origin\/main and this checkout does not contain origin\/main[\s\S]*git fetch origin main/.test(
        thrown(() => readOrchestratorConfig(pathToFileURL(stale.configPath))) ?? "",
      ),
    stale === null ? "could not stage the git fixture" : String(thrown(() => readOrchestratorConfig(pathToFileURL(stale.configPath)))),
  )
  const ahead = stageConfigRepo("ahead", { head: "newer", origin: "base", working: `${JSON.stringify(real)}\n` })
  T(
    `${NAME}: a checkout that already contains origin/main is deliberately newer and is read`,
    ahead !== null && readOrchestratorConfig(pathToFileURL(ahead.configPath)).worker === real.worker,
    ahead === null ? "could not stage the git fixture" : `the staleness guard fired on a checkout containing origin/main: ${thrown(() => readOrchestratorConfig(pathToFileURL(ahead.configPath)))}`,
  )
}
