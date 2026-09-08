import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root } from "./_harness.mjs"

const TOOL = "check-calibration.mjs"

const AGENT = ["---", "name: design-reviewer", "tools: Glob, Grep, Read", "model: sonnet", "effort: medium", "---", "", "body", ""].join("\n")
const SKILL = ["---", "name: ticket", "effort: high", "---", "", "body", ""].join("\n")
/** A skill that declares no tuning at all, which eleven of the eighteen live ones do not. */
const UNTUNED_SKILL = ["---", "name: lesson", "---", "", "body", ""].join("\n")

const digestOf = (body) => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16)

const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body, "utf8")
  return path
}

const today = () => {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
}
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

/**
 * A fixture harness: two agents' worth of shape in three files, plus whatever stamp the case wants.
 * `stamp === null` writes no stamp at all, which is the unreadable case.
 */
const stageHarness = (label, { stamp, model = "gpt-5.6-sol", engine = "codex", args = ['-c', 'model_reasoning_effort="high"'], engineArgs = ["exec"], extraFiles = {} } = {}) => {
  const fixture = join(root, "check-calibration", label)
  write(join(fixture, ".claude", "agents", "design-reviewer.md"), AGENT)
  write(join(fixture, ".claude", "skills", "ticket", "SKILL.md"), SKILL)
  write(join(fixture, ".claude", "skills", "lesson", "SKILL.md"), UNTUNED_SKILL)
  // A directory with no SKILL.md is not a calibrated file, exactly like the live `_shared` directory.
  mkdirSync(join(fixture, ".claude", "skills", "_shared"), { recursive: true })
  for (const [relativePath, body] of Object.entries(extraFiles)) write(join(fixture, relativePath), body)
  write(
    join(fixture, ".claude", "orchestrator.json"),
    `${JSON.stringify({ caps: { parallelTickets: 3 }, worker: engine, workers: { [engine]: { args: engineArgs, models: { default: { model, args } } } } }, null, 2)}\n`,
  )
  if (stamp !== null) write(join(fixture, ".claude", "calibration.json"), `${JSON.stringify(stamp, null, 2)}\n`)
  return fixture
}

const currentStamp = (overrides = {}) => ({
  calibratedAt: today(),
  workerEngine: "codex",
  workerModel: "gpt-5.6-sol",
  // The RESOLVED vector launch-worker.mjs launches: engine args, then profile args, then the model.
  workerArgs: ["exec", "-c", 'model_reasoning_effort="high"', "--model", "gpt-5.6-sol"],
  workerModelSource: "resolveWorkerInvocation(config.worker, ..., default) in tools/lib/orchestrator-config.mjs",
  entries: {
    ".claude/agents/design-reviewer.md": { model: "sonnet", effort: "medium", digest: digestOf(AGENT), verdict: "current" },
    ".claude/skills/lesson/SKILL.md": { model: null, effort: null, digest: digestOf(UNTUNED_SKILL), verdict: "undeclared, inherits the session" },
    ".claude/skills/ticket/SKILL.md": { model: null, effort: "high", digest: digestOf(SKILL), verdict: "current" },
  },
  ...overrides,
})

const withEntries = (mutate) => {
  const stamp = currentStamp()
  mutate(stamp.entries)
  return stamp
}

export const cases = () => {
  check(TOOL, "a stamp covering every agent and skill file exits 0", ["--root", stageHarness("clean", { stamp: currentStamp() })], {
    status: 0,
    stdout: /3 calibrated file\(s\) stamped .* against codex gpt-5\.6-sol \["exec","-c","model_reasoning_effort=\\"high\\"","--model","gpt-5\.6-sol"\]/,
  })

  // The denominator is a glob, so a file added without a verdict is the case that catches the failure
  // ORB-120 actually had: the `quota` skill arrived and was never added to the calibration.
  check(
    TOOL,
    "an agent added with no stamp entry exits 1 and names it",
    ["--root", stageHarness("added-agent", { stamp: currentStamp(), extraFiles: { ".claude/agents/new-critic.md": AGENT } })],
    { status: 1, stderr: /no calibration entry for \.claude\/agents\/new-critic\.md/ },
  )

  check(
    TOOL,
    "a skill added with no stamp entry exits 1 and names it",
    ["--root", stageHarness("added-skill", { stamp: currentStamp(), extraFiles: { ".claude/skills/quota/SKILL.md": SKILL } })],
    { status: 1, stderr: /no calibration entry for \.claude\/skills\/quota\/SKILL\.md/ },
  )

  check(
    TOOL,
    "a stamp entry naming a file that no longer exists exits 1",
    [
      "--root",
      stageHarness("stale-entry", {
        stamp: withEntries((entries) => {
          entries[".claude/skills/deleted/SKILL.md"] = { model: null, effort: "high", verdict: "current" }
        }),
      }),
    ],
    { status: 1, stderr: /the stamp names \.claude\/skills\/deleted\/SKILL\.md, which is not an agent or skill/ },
  )

  // The event trigger: the change that causes the decay is the change that raises the alarm.
  check(
    TOOL,
    "editing the worker model without a fresh stamp exits 1",
    ["--root", stageHarness("model-moved", { stamp: currentStamp(), model: "gpt-6-next" })],
    { status: 1, stderr: /the worker model is gpt-6-next and the stamp was taken against gpt-5\.6-sol/ },
  )

  check(
    TOOL,
    "changing an agent's own model without a fresh stamp exits 1",
    [
      "--root",
      stageHarness("agent-model-moved", {
        stamp: withEntries((entries) => {
          entries[".claude/agents/design-reviewer.md"].model = "haiku"
        }),
      }),
    ],
    { status: 1, stderr: /design-reviewer\.md declares model "sonnet" but the stamp recorded "haiku"/ },
  )

  check(
    TOOL,
    "declaring an effort a skill did not have before exits 1",
    [
      "--root",
      stageHarness("effort-declared", {
        stamp: withEntries((entries) => {
          entries[".claude/skills/lesson/SKILL.md"].effort = "high"
        }),
      }),
    ],
    { status: 1, stderr: /lesson\/SKILL\.md declares effort null but the stamp recorded "high"/ },
  )

  /**
   * THE BODY-ONLY EDIT, which PR #640 proved once and the #188 re-derivation lost. A verdict is a
   * judgement about what the file ASKS THE MODEL TO DO, so rewriting the prompt invalidates it even
   * though `model:` and `effort:` never move. Without a content digest this exited 0 and the stale
   * verdict rode the 90-day age backstop.
   */
  check(
    TOOL,
    "rewriting a skill's BODY with its model and effort unchanged exits 1",
    [
      "--root",
      stageHarness("body-rewritten", {
        stamp: currentStamp(),
        extraFiles: { ".claude/skills/ticket/SKILL.md": SKILL.replace("body", "a materially more demanding body") },
      }),
    ],
    { status: 1, stderr: /ticket\/SKILL\.md changed since it was calibrated/ },
  )
  /** An entry with no digest at all cannot tie its verdict to any text, so it is stale by construction. */
  check(
    TOOL,
    "an entry carrying no digest exits 1",
    [
      "--root",
      stageHarness("digest-missing", {
        stamp: withEntries((entries) => {
          delete entries[".claude/skills/ticket/SKILL.md"].digest
        }),
      }),
    ],
    { status: 1, stderr: /ticket\/SKILL\.md has no recorded digest/ },
  )

  /**
   * The engine is resolved from `config.worker`, the same key launch-worker.mjs:115 reads, and not
   * hardcoded. Switching the engine has to go red, or this gate compares a profile nobody runs.
   */
  check(
    TOOL,
    "switching the worker engine without a fresh stamp exits 1",
    ["--root", stageHarness("engine-switched", { stamp: currentStamp(), engine: "claude" })],
    { status: 1, stderr: /the worker engine is claude and the stamp was taken against codex/ },
  )
  check(
    TOOL,
    "a config whose declared worker names no such engine exits 2 rather than passing vacuously",
    [
      "--root",
      (() => {
        const fixture = stageHarness("engine-missing", { stamp: currentStamp() })
        write(
          join(fixture, ".claude", "orchestrator.json"),
          `${JSON.stringify({ worker: "nonexistent", workers: { codex: { args: ["exec"], models: { default: { model: "gpt-5.6-sol", args: [] } } } } }, null, 2)}\n`,
        )
        return fixture
      })(),
    ],
    { status: 2, stderr: /worker engine "nonexistent" is missing from \.claude\/orchestrator\.json/ },
  )

  /**
   * The reasoning effort lives in the profile's args, so a model string that never moves can still have
   * its tuning changed underneath. An args-only edit decays the calibration exactly like a model edit.
   */
  check(
    TOOL,
    "changing only the reasoning effort in the profile args exits 1",
    ["--root", stageHarness("args-changed", { stamp: currentStamp(), args: ["-c", 'model_reasoning_effort="low"'] })],
    { status: 1, stderr: /this is the whole resolved launch vector, engine args included/ },
  )
  /**
   * The half this gate could not see. `resolveWorkerInvocation` prepends `engine.args` to every launch,
   * so tuning declared at the ENGINE level moves the effective effort exactly like profile tuning does.
   * Reading `models.default.args` alone exited 0 on this configuration while every worker launched at
   * low effort, which is the gate-that-cannot-fail shape this tool exists to undo.
   */
  check(
    TOOL,
    "changing only the reasoning effort in the ENGINE args exits 1",
    [
      "--root",
      stageHarness("engine-args-changed", { stamp: currentStamp(), args: [], engineArgs: ["exec", "-c", 'model_reasoning_effort="low"'] }),
    ],
    { status: 1, stderr: /this is the whole resolved launch vector, engine args included/ },
  )
  /**
   * And the same configuration with the stamp reseeded against it passes, so the case above proves the
   * gate reads engine args rather than merely that this fixture is unusual.
   */
  check(
    TOOL,
    "the same engine-level tuning passes once the stamp records the resolved vector",
    [
      "--root",
      stageHarness("engine-args-reseeded", {
        stamp: currentStamp({ workerArgs: ["exec", "-c", 'model_reasoning_effort="low"', "--model", "gpt-5.6-sol"] }),
        args: [],
        engineArgs: ["exec", "-c", 'model_reasoning_effort="low"'],
      }),
    ],
    { status: 0 },
  )

  // The alias backstop. A model alias can move without its declared string changing, so age is the
  // only signal left and it is not decoration.
  check(
    TOOL,
    "a stamp 91 days old exits 1 on the alias backstop",
    ["--root", stageHarness("too-old", { stamp: currentStamp({ calibratedAt: daysAgo(91) }) })],
    { status: 1, stderr: /the stamp is 91 days old, past the 90 day backstop/ },
  )

  check(
    TOOL,
    "a stamp 89 days old is still current",
    ["--root", stageHarness("nearly-old", { stamp: currentStamp({ calibratedAt: daysAgo(89) }) })],
    { status: 0 },
  )

  // An unreadable stamp is a configuration error, exit 2, never a stale verdict. A gate that reports
  // "stale" when it could not read its own input teaches everyone to reseed instead of to look.
  check(TOOL, "a missing stamp exits 2, not 1", ["--root", stageHarness("no-stamp", { stamp: null })], {
    status: 2,
    stderr: /cannot read the calibration stamp/,
  })

  const malformed = stageHarness("malformed", { stamp: currentStamp() })
  write(join(malformed, ".claude", "calibration.json"), "{ not json\n")
  check(TOOL, "a malformed stamp exits 2, not 1", ["--root", malformed], { status: 2, stderr: /cannot read the calibration stamp/ })

  check(
    TOOL,
    "a stamp with no calibratedAt date exits 2",
    ["--root", stageHarness("no-date", { stamp: currentStamp({ calibratedAt: "recently" }) })],
    { status: 2, stderr: /calibratedAt must be a YYYY-MM-DD date/ },
  )

  /**
   * `Date.UTC` NORMALIZES an impossible calendar date rather than refusing it, so the YYYY-MM-DD regex
   * alone lets `2026-02-31` through as 2026-03-03. Only a round-trip refuses it.
   */
  check(
    TOOL,
    "a well-formed but impossible calendar date exits 2 instead of being normalized",
    ["--root", stageHarness("impossible-date", { stamp: currentStamp({ calibratedAt: "2026-02-31" }) })],
    { status: 2, stderr: /is not a real calendar date/ },
  )

  /**
   * The one that turned the backstop OFF. A future stamp produced a finite NEGATIVE age, which sails
   * past a `> MAX_AGE_DAYS` test: a 9999-12-31 stamp exited 0 at -2912192 days old. That is the
   * gate-that-cannot-fail failure this whole ticket exists to undo, so it is a data error.
   */
  check(
    TOOL,
    "a stamp dated in the FUTURE exits 2 rather than disabling the max-age backstop",
    ["--root", stageHarness("future-date", { stamp: currentStamp({ calibratedAt: "9999-12-31" }) })],
    { status: 2, stderr: /day\(s\) in the FUTURE, which would disable the max-age backstop/ },
  )
  check(
    TOOL,
    "a stamp dated tomorrow is refused too, so the future check is not only about absurd years",
    ["--root", stageHarness("tomorrow", { stamp: currentStamp({ calibratedAt: daysAgo(-1) }) })],
    { status: 2, stderr: /1 day\(s\) in the FUTURE/ },
  )

  check(
    TOOL,
    "an entry carrying no verdict exits 2, so a stamp cannot be filled in without deciding",
    [
      "--root",
      stageHarness("no-verdict", {
        stamp: withEntries((entries) => {
          delete entries[".claude/skills/ticket/SKILL.md"].verdict
        }),
      }),
    ],
    { status: 2, stderr: /entry \.claude\/skills\/ticket\/SKILL\.md carries no verdict/ },
  )

  const noProfile = stageHarness("no-profile", { stamp: currentStamp() })
  write(join(noProfile, ".claude", "orchestrator.json"), `${JSON.stringify({ caps: { parallelTickets: 3 } }, null, 2)}\n`)
  check(TOOL, "a config declaring no worker engine exits 2 rather than passing vacuously", ["--root", noProfile], {
    status: 2,
    stderr: /declares no `worker`/,
  })

  // A tree with nothing to calibrate must fail loudly rather than report a green over zero files,
  // which is how a coverage gate silently stops covering anything.
  const emptyTree = join(root, "check-calibration", "empty")
  mkdirSync(join(emptyTree, ".claude", "agents"), { recursive: true })
  mkdirSync(join(emptyTree, ".claude", "skills"), { recursive: true })
  write(
    join(emptyTree, ".claude", "orchestrator.json"),
    `${JSON.stringify({ worker: "codex", workers: { codex: { models: { default: { model: "gpt-5.6-sol", args: [] } } } } }, null, 2)}\n`,
  )
  write(
    join(emptyTree, ".claude", "calibration.json"),
    `${JSON.stringify({ calibratedAt: today(), workerEngine: "codex", workerModel: "gpt-5.6-sol", workerArgs: [], entries: {} }, null, 2)}\n`,
  )
  check(TOOL, "a tree with no agent and no skill exits 2 rather than reporting a vacuous green", ["--root", emptyTree], {
    status: 2,
    stderr: /holds no \.claude\/agents/,
  })

  check(TOOL, "there is no --report-only flag to pass", ["--root", stageHarness("no-report-only", { stamp: currentStamp() }), "--report-only"], {
    status: 2,
    stderr: /invalid arguments/,
  })
}
