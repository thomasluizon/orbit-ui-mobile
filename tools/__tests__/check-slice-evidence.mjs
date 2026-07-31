/**
 * check-slice-evidence.mjs drives no model and reads no clock, so every case here is a fixture on
 * disk. The five committed fixtures under tools/__fixtures__/slice-evidence are SHAPED FROM REAL
 * codex rollouts (the 2026-07-27 parent/subagent pair under ~/.codex/sessions), not invented, so a
 * change in the engine's record format breaks these cases instead of passing them. Every event
 * they carry was observed there: session_meta with its id / parent_thread_id / thread_source /
 * agent_path, and function_call "spawn_agent" in namespace "collaboration". No case plants an
 * event shape nobody has seen.
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, check, root, run, orchestratorConfig, INTERACTIVE_CODEX, INTERACTIVE_WORKER } from "./_harness.mjs"

const FIXTURES = join(REPO_ROOT, "tools", "__fixtures__", "slice-evidence")

/**
 * A private copy of the tool beside a hand-written .claude/orchestrator.json, because the tool
 * resolves the engine from that file and the gate keys on the RESOLVED engine. Staging it is what
 * lets the unknown-engine refusal be driven without editing the repository's real config.
 */
const stageSliceEvidence = (label, worker = INTERACTIVE_CODEX, engineName = "codex") => {
  const base = join(root, "slice-evidence", label)
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(join(base, ".claude", "orchestrator.json"), orchestratorConfig(repoPath, worker, engineName))
  cpSync(join(REPO_ROOT, "tools", "check-slice-evidence.mjs"), join(base, "tools", "check-slice-evidence.mjs"))
  cpSync(join(REPO_ROOT, "tools", "lib"), join(base, "tools", "lib"), { recursive: true })
  return { path: join(base, "tools", "check-slice-evidence.mjs"), base }
}

/** A mutable copy of one committed fixture, so a case can break exactly one fact about it. */
const copyFixture = (fixture, label) => {
  const destination = join(root, "slice-evidence-fixtures", label)
  cpSync(join(FIXTURES, fixture), destination, { recursive: true })
  return destination
}

const rolloutsOf = (directory) => join(directory, "engine-home", "sessions", "2026", "07", "31")

/** The rollout file carrying one start stamp, so no case has to hardcode a fixture thread id. */
const rolloutStartingAt = (directory, stamp) => {
  const match = readdirSync(directory).find((file) => file.includes(`T${stamp}-00-`))
  if (!match) throw new Error(`no fixture rollout starting at ${stamp} in ${directory}`)
  return join(directory, match)
}

const argumentsFor = (directory) => [
  "--issue", "ORB-163",
  "--slices", join(directory, "slices.json"),
  "--engine-home", join(directory, "engine-home"),
  "--ledger", join(directory, "ledger.jsonl"),
]

export const cases = () => {
  const staged = stageSliceEvidence("codex")

  check(
    "check-slice-evidence.mjs",
    "three overlapping reserved rollouts over disjoint slices prove the run",
    argumentsFor(join(FIXTURES, "multi-disjoint")),
    { status: 0, stdout: /multi-process, 3 slice rollout\(s\), 3 overlapping pair\(s\), 3 closed reservation\(s\)[\s\S]*proved structurally/ },
    { path: staged.path },
  )

  check(
    "check-slice-evidence.mjs",
    "two slices claiming one path fail, naming the shared path",
    argumentsFor(join(FIXTURES, "multi-colliding")),
    { status: 1, stdout: /slices "slice_a" and "slice_b" both claim tools\/lib\/strike-ledger\.mjs/ },
    { path: staged.path },
  )

  /**
   * The ORB-153 shape, measured in production: three spawn_agent children burned 160,505 uncached
   * input tokens the ledger never saw. Three running slices, one reservation, and the run still
   * reported done.
   */
  const unreserved = run("check-slice-evidence.mjs", argumentsFor(join(FIXTURES, "multi-unreserved")), { path: staged.path })
  const unreservedShortfalls = unreserved.stdout.split("\n").filter((line) => line.includes("unreserved slice process"))
  T(
    "check-slice-evidence.mjs: three rollouts against one reservation fail, naming every unreserved slice",
    unreserved.status === 1 &&
      unreservedShortfalls.length === 2 &&
      unreservedShortfalls.every((line) => /rollout rollout-2026-07-31T10-0[34]-00-.*\.jsonl \(thread 019fb600-[34]{4}-/.test(line)) &&
      unreservedShortfalls.every((line) => line.includes("invisible to the fuse")),
    `exit ${unreserved.status}\n     ${unreserved.stdout.trim()}\n     ${unreserved.stderr.trim()}`,
  )

  check(
    "check-slice-evidence.mjs",
    "an in-session spawn_agent fan-out with overlapping child rollouts proves the run",
    argumentsFor(join(FIXTURES, "fallback-disjoint")),
    { status: 0, stdout: /in-session-fanout, 3 slice rollout\(s\), 3 overlapping pair\(s\)[\s\S]*proved structurally/ },
    { path: staged.path },
  )

  // Gate proof 1: the pass fixtures must be able to fail. Serialise the same three rollouts and
  // nothing else, and the overlap verdict has to flip. Without this the passing cases could be
  // passing because the tool never looked at an interval.
  const serial = copyFixture("multi-disjoint", "serialised")
  const serialWindows = [
    ["10-02", "2026-07-31T10:02:00.000Z", "2026-07-31T10:02:30.000Z"],
    ["10-03", "2026-07-31T10:03:00.000Z", "2026-07-31T10:03:30.000Z"],
    ["10-04", "2026-07-31T10:04:00.000Z", "2026-07-31T10:04:30.000Z"],
  ]
  for (const [stamp, , endedAt] of serialWindows) {
    const path = rolloutStartingAt(rolloutsOf(serial), stamp)
    const events = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    events.at(-1).timestamp = endedAt
    writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`)
  }
  check(
    "check-slice-evidence.mjs",
    "slice rollouts that never overlap are serial, not concurrent",
    argumentsFor(serial),
    { status: 1, stdout: /no two of the 3 slice rollout\(s\) for ORB-163 have overlapping intervals/ },
    { path: staged.path },
  )

  // Gate proof 2: the fallback shape's concurrency rests on the SAME overlapping child intervals
  // as the multi-process shape, and on no synchronisation event. A `close_agent` signal used to
  // sit here; it was deleted because that event occurs ZERO times in the 275 real codex rollouts
  // on this machine, so it could pass a serial fan-out as concurrent. Serialise the three
  // children and the fallback fixture has to flip, which is what proves the real signal carries
  // the verdict on its own.
  const serialChildren = copyFixture("fallback-disjoint", "fallback-serialised")
  for (const [stamp, , endedAt] of serialWindows) {
    const path = rolloutStartingAt(rolloutsOf(serialChildren), stamp)
    const events = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    events.at(-1).timestamp = endedAt
    writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`)
  }
  check(
    "check-slice-evidence.mjs",
    "a fallback fan-out whose child rollouts never overlap is serial, not concurrent",
    argumentsFor(serialChildren),
    { status: 1, stdout: /no two of the 3 slice rollout\(s\) for ORB-163 have overlapping intervals/ },
    { path: staged.path },
  )

  /**
   * The reservation lookup must bind to THIS run. This fixture carries a prior completed run's
   * three closed reservations, dated 2026-07-24, against a 2026-07-31 fan-out that reserved
   * nothing at all. Before the fix it exited 0: every old reservation merely preceded every new
   * rollout, so last week's budget paid for this week's slices and the gate reported green over
   * the one thing it exists to check.
   */
  const stale = run("check-slice-evidence.mjs", argumentsFor(join(FIXTURES, "multi-stale-reservations")), { path: staged.path })
  const staleShortfalls = stale.stdout.split("\n").filter((line) => line.includes("unreserved slice process"))
  T(
    "check-slice-evidence.mjs: a prior run's reservations cannot pay for a later fan-out that reserved nothing",
    stale.status === 1 &&
      staleShortfalls.length === 3 &&
      staleShortfalls.every((line) => line.includes("inside no automation-budget reservation window for ORB-163")) &&
      ["10-02", "10-03", "10-04"].every((stamp) => staleShortfalls.some((line) => line.includes(`rollout-2026-07-31T${stamp}-00-`))),
    `exit ${stale.status}\n     ${stale.stdout.trim()}\n     ${stale.stderr.trim()}`,
  )

  // A slice that declares no file set fails in EITHER shape: an undeclared set cannot be proved
  // disjoint from anything, and silence must not buy parallelism.
  for (const fixture of ["multi-disjoint", "fallback-disjoint"]) {
    const silent = copyFixture(fixture, `${fixture}-silent`)
    const plan = JSON.parse(readFileSync(join(silent, "slices.json"), "utf8"))
    plan.slices[1].files = []
    writeFileSync(join(silent, "slices.json"), `${JSON.stringify(plan, null, 2)}\n`)
    check(
      "check-slice-evidence.mjs",
      `a slice declaring no file set fails in the ${fixture} shape`,
      argumentsFor(silent),
      { status: 1, stdout: /slice "slice_b" declares no file set/ },
      { path: staged.path },
    )
  }

  const missingChild = copyFixture("fallback-disjoint", "missing-child")
  const plan = JSON.parse(readFileSync(join(missingChild, "slices.json"), "utf8"))
  plan.slices.push({ name: "slice_d", files: ["tools/README.md"] })
  writeFileSync(join(missingChild, "slices.json"), `${JSON.stringify(plan, null, 2)}\n`)
  check(
    "check-slice-evidence.mjs",
    "a declared slice with no subagent rollout is named, never assumed to have run",
    argumentsFor(missingChild),
    { status: 1, stdout: /no subagent rollout carrying agent_path "\/root\/slice_d"/ },
    { path: staged.path },
  )

  /**
   * CODEX_HOME decides where the run record is, and Orca redirects it to
   * %APPDATA%\\orca\\codex-runtime-home\\home. A gate that assumed a default home would read an
   * empty directory and call a real run "no slices". So the env is read, and its absence refuses.
   */
  const fromEnvironment = run(
    "check-slice-evidence.mjs",
    ["--issue", "ORB-163", "--slices", join(FIXTURES, "multi-disjoint", "slices.json"), "--ledger", join(FIXTURES, "multi-disjoint", "ledger.jsonl")],
    { path: staged.path, env: { CODEX_HOME: join(FIXTURES, "multi-disjoint", "engine-home") } },
  )
  T(
    "check-slice-evidence.mjs: the engine home comes from the worker's CODEX_HOME, not a default",
    fromEnvironment.status === 0 && fromEnvironment.stdout.includes("proved structurally"),
    `exit ${fromEnvironment.status}\n     ${fromEnvironment.stdout.trim()}\n     ${fromEnvironment.stderr.trim()}`,
  )
  check(
    "check-slice-evidence.mjs",
    "refuses to guess an engine home when CODEX_HOME is unset",
    ["--issue", "ORB-163", "--slices", join(FIXTURES, "multi-disjoint", "slices.json")],
    { status: 2, stderr: /pass --engine-home or set CODEX_HOME[\s\S]*never assumed/ },
    { path: staged.path, env: { CODEX_HOME: "" } },
  )

  const claudeEngine = stageSliceEvidence("claude-engine", INTERACTIVE_WORKER, "claude")
  check(
    "check-slice-evidence.mjs",
    "refuses an engine with no rollout profile rather than assuming the codex layout",
    argumentsFor(join(FIXTURES, "multi-disjoint")),
    { status: 2, stderr: /worker engine "claude", which tools\/check-slice-evidence\.mjs has no rollout profile for[\s\S]*Known: codex/ },
    { path: claudeEngine.path },
  )

  check(
    "check-slice-evidence.mjs",
    "refuses a slice plan with no slices array",
    ["--issue", "ORB-163", "--slices", join(FIXTURES, "multi-disjoint", "ledger.jsonl"), "--engine-home", join(FIXTURES, "multi-disjoint", "engine-home")],
    { status: 2, stderr: /is not JSON|declares no slices array/ },
    { path: staged.path },
  )

  const jsonVerdict = run("check-slice-evidence.mjs", [...argumentsFor(join(FIXTURES, "multi-disjoint")), "--json"], { path: staged.path })
  let parsedVerdict = null
  try {
    parsedVerdict = JSON.parse(jsonVerdict.stdout)
  } catch {
    parsedVerdict = null
  }
  T(
    "check-slice-evidence.mjs: the json verdict carries every rollout interval and reservation it judged",
    jsonVerdict.status === 0 &&
      parsedVerdict?.shape === "multi-process" &&
      parsedVerdict.sliceRollouts.length === 3 &&
      parsedVerdict.sliceRollouts.every((rollout) => rollout.startedAt < rollout.endedAt) &&
      parsedVerdict.overlappingPairs.length === 3 &&
      parsedVerdict.reservations.length === 3 &&
      parsedVerdict.shortfalls.length === 0,
    `exit ${jsonVerdict.status}\n     ${jsonVerdict.stdout.trim().slice(0, 600)}\n     ${jsonVerdict.stderr.trim()}`,
  )
}
