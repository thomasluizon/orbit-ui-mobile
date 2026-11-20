import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, hermeticPace, realOrchestratorConfig, root, run, same, stage } from "./_harness.mjs"
import { PACE_DECISIONS, awaitPace, calibrationPath, countLiveLaunchers, readCalibration, readPace, takeReading, weekWindow, weightedSpend, weightsFingerprint, writeCalibration } from "../lib/pace-governor.mjs"
import { readWakeSourceStates, registerWakeSource } from "../lib/run-state.mjs"
import { githubAuthEnv, launch, launchConfig, stubEngine } from "./launch-worker.mjs"
import { paceOfStatus } from "../run-status.mjs"

const UNIT = "lib/pace-governor.mjs"
/** The shape of a real `message.usage` object; each record below replaces its counts. */
const USAGE_SHAPE = JSON.parse(readFileSync(new URL("./fixtures/session-usage.json", import.meta.url), "utf8"))
const SONNET = "claude-sonnet-5-5"
const OPUS = "claude-opus-5-5"
const HOUR = 3_600_000
const WEEK = 168 * HOUR
const iso = (ms) => new Date(ms).toISOString()

/** The weekly reset is Thursday 04:00 at UTC-3, which is 07:00 UTC, and 19 November 2026 is a Thursday. */
const RESET = Date.parse("2026-11-19T07:00:00.000Z")
/** Two days into the week: 48 of 168 hours, so the line stands at 0.2857 of the budget. */
const CHECK = RESET + 48 * HOUR

const call = ({ id, at, model = SONNET, input = 0, cacheRead = 0, cacheWrite1h = 0, cacheWrite5m = 0, output = 0, sidechain = false, type = "assistant" }) => JSON.stringify({
  type, isSidechain: sidechain, timestamp: iso(at),
  message: { id, model, usage: { ...USAGE_SHAPE, input_tokens: input, cache_creation_input_tokens: cacheWrite1h + cacheWrite5m,
    cache_creation: { ephemeral_1h_input_tokens: cacheWrite1h, ephemeral_5m_input_tokens: cacheWrite5m }, cache_read_input_tokens: cacheRead, output_tokens: output } },
})

let scenarioCount = 0
/** One checkout and one transcript directory. `files` maps a path to its record lines; `reading` stores an owner reading. */
const scenario = ({ files, reading = null, workerCap }) => {
  const directory = join(root, "pace-governor", String(++scenarioCount))
  const transcripts = join(directory, "projects")
  const repoRoot = join(directory, "checkout")
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  for (const [name, lines] of Object.entries(files)) {
    const path = join(transcripts, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${lines.join("\n")}\n`)
  }
  const pace = { ...realOrchestratorConfig().pace, transcriptRoot: transcripts, ...(workerCap ? { workerCap } : {}) }
  if (reading) writeCalibration(calibrationPath(repoRoot), { percent: 10, readAt: iso(RESET + HOUR), weeklyBudget: 1_000_000, weights: weightsFingerprint(pace), ...reading })
  return { pace, repoRoot, config: { pace } }
}

const verdictOf = (rows, { nowMs = CHECK, liveWorkers = 0 } = {}) => readPace({ config: rows.config, repoRoot: rows.repoRoot, nowMs, liveWorkers })
const oneCall = (output, at = CHECK - HOUR) => ({ "a/session.jsonl": [call({ id: "m1", at, output })] })

/** A sonnet call of N output tokens weighs 5 * N under the shipped weights. The stored budget is 1,000,000 weighted tokens. */
const tableCases = () => {
  const under = verdictOf(scenario({ files: oneCall(20_000), reading: {} }))
  same(`${UNIT}: under the line the launch is admitted, with its share, its line and its headroom`,
    { decision: under.decision, spentShare: under.spentShare, lineShare: under.lineShare, headroomHours: under.headroomHours, overLine: under.overLine, wakeAt: under.wakeAt },
    { decision: "ADMIT", spentShare: 0.1, lineShare: 0.2857, headroomHours: 31.2, overLine: false, wakeAt: null })

  const over = verdictOf(scenario({ files: oneCall(80_000), reading: {} }))
  same(`${UNIT}: over the line the launch is held until the line catches up with the spend`,
    { decision: over.decision, spentShare: over.spentShare, headroomHours: over.headroomHours, overLine: over.overLine, wakeAt: over.wakeAt },
    { decision: "HOLD_LINE", spentShare: 0.4, headroomHours: -19.2, overLine: true, wakeAt: "2026-11-22T02:12:00.000Z" })

  const onTheLine = verdictOf(scenario({ files: oneCall(20_000), reading: { weeklyBudget: 100_000 / (48 / 168) } }))
  T(`${UNIT}: a spend exactly on the line is admitted`, onTheLine.decision === "ADMIT" && onTheLine.overLine === false, JSON.stringify(onTheLine))

  const spentBudget = verdictOf(scenario({ files: oneCall(400_000), reading: {} }))
  T(`${UNIT}: a spent budget wakes at the next reset, never later`, spentBudget.decision === "HOLD_LINE" && spentBudget.wakeAt === iso(RESET + WEEK), JSON.stringify(spentBudget))

  const coordinatorAndSubagent = verdictOf(scenario({
    files: {
      "a/main.jsonl": [
        call({ id: "opus-1", at: CHECK - 3 * HOUR, model: OPUS, output: 10_000 }),
        call({ id: "opus-1", at: CHECK - 3 * HOUR + 1, model: OPUS, output: 10_000 }),
        call({ id: "note", at: CHECK - 3 * HOUR, model: OPUS, output: 99_000, type: "user" }),
        "not json {\"usage\":1}",
      ],
      "a/main/subagents/agent-1.jsonl": [call({ id: "sub-1", at: CHECK - 2 * HOUR, output: 10_000, sidechain: true })],
      "b/copy.jsonl": [call({ id: "opus-1", at: CHECK - 3 * HOUR, model: OPUS, output: 10_000 })],
    },
    reading: {},
  }))
  // Opus: 5 * 10,000 * 1.7 = 85,000. The subagent: 5 * 10,000 = 50,000. The streamed record and the copy of opus-1 count once.
  T(`${UNIT}: the coordinator and a subagent count once each, and a streamed record or a copy counts once`, coordinatorAndSubagent.spentWeighted === 135_000, String(coordinatorAndSubagent.spentWeighted))

  const weighted = verdictOf(scenario({
    files: { "a/session.jsonl": [call({ id: "w1", at: CHECK - HOUR, input: 100_000, cacheRead: 1_000_000, cacheWrite1h: 100_000, cacheWrite5m: 100_000, output: 10_000 })] },
    reading: {},
  }))
  // 100,000 input + 1,000,000 * 0.1 read + 100,000 * 2 one-hour write + 100,000 * 1.25 five-minute write + 10,000 * 5 output.
  T(`${UNIT}: each token class carries its weight`, weighted.spentWeighted === 575_000, String(weighted.spentWeighted))

  const future = verdictOf(scenario({ files: oneCall(80_000, CHECK + HOUR), reading: {} }))
  T(`${UNIT}: a call after the check time is not spend yet`, future.spentWeighted === 0 && future.decision === "ADMIT", JSON.stringify(future))

  // 06:59:59.999 UTC is the last moment of the old week and 07:00:00.000 the first of the new one.
  const boundary = { "a/session.jsonl": [call({ id: "old", at: RESET - 1, output: 1_000_000 }), call({ id: "new", at: RESET, output: 20_000 })] }
  const atReset = verdictOf(scenario({ files: boundary, reading: {} }), { nowMs: RESET })
  same(`${UNIT}: at the reset the new week holds the call stamped at the reset and none of the old spend`,
    { windowStart: atReset.windowStart, spentWeighted: atReset.spentWeighted, lineShare: atReset.lineShare }, { windowStart: iso(RESET), spentWeighted: 100_000, lineShare: 0 })
  const beforeReset = verdictOf(scenario({ files: boundary, reading: {} }), { nowMs: RESET - 1 })
  same(`${UNIT}: one millisecond before the reset the old week holds its spend and not the new call`,
    { windowStart: beforeReset.windowStart, spentWeighted: beforeReset.spentWeighted }, { windowStart: iso(RESET - WEEK), spentWeighted: 5_000_000 })
  same(`${UNIT}: the weekly window opens on Thursday 04:00 at UTC-3 at every time of the week`,
    [RESET - 1, RESET, RESET + 1, RESET + WEEK - 1, RESET + WEEK].map((nowMs) => iso(weekWindow(nowMs, realOrchestratorConfig().pace.weeklyReset).startMs)),
    [iso(RESET - WEEK), iso(RESET), iso(RESET), iso(RESET), iso(RESET + WEEK)])

  const noReading = verdictOf(scenario({ files: oneCall(800_000) }))
  T(`${UNIT}: with no stored reading the launch is admitted and the verdict says so`,
    noReading.decision === "ADMIT" && noReading.calibration.state === "NONE" && noReading.spentShare === null && /no owner reading is stored/.test(noReading.reason), JSON.stringify(noReading))

  const lastWeek = verdictOf(scenario({ files: oneCall(80_000), reading: { readAt: iso(RESET - 3 * HOUR), percent: 12 } }))
  T(`${UNIT}: a reading from an earlier week is used and the verdict says no reading was taken this week`,
    lastWeek.decision === "HOLD_LINE" && lastWeek.calibration.state === "PREVIOUS_WEEK" && /no reading was taken this week.*12%/.test(lastWeek.calibration.note), JSON.stringify(lastWeek))

  const otherUnits = verdictOf(scenario({ files: oneCall(80_000), reading: { weights: "{}" } }))
  T(`${UNIT}: a reading taken under other weights is not compared with this spend`,
    otherUnits.decision === "ADMIT" && otherUnits.calibration.state === "OTHER_WEIGHTS" && /other token weights/.test(otherUnits.reason), JSON.stringify(otherUnits))

  const capped = scenario({ files: oneCall(20_000), reading: {}, workerCap: 3 })
  same(`${UNIT}: under the line the launch is admitted below the worker cap and held at it`,
    [0, 2, 3, 4].map((liveWorkers) => verdictOf(capped, { liveWorkers }).decision), ["ADMIT", "ADMIT", "HOLD_CAP", "HOLD_CAP"])
  const overAndCapped = verdictOf(scenario({ files: oneCall(80_000), reading: {} }), { liveWorkers: 3 })
  T(`${UNIT}: over the line and at the cap, the line hold wins because it carries the wake time`, overAndCapped.decision === "HOLD_LINE" && overAndCapped.wakeAt === "2026-11-22T02:12:00.000Z", JSON.stringify(overAndCapped))

  const unusable = verdictOf(scenario({
    files: { "a/session.jsonl": [
      call({ id: "ok", at: CHECK - HOUR, output: 20_000 }),
      JSON.stringify({ type: "assistant", timestamp: iso(CHECK - HOUR), message: { id: "bad-count", usage: { input_tokens: "x" } } }),
      JSON.stringify({ type: "assistant", timestamp: "not a time", message: { id: "bad-time", usage: USAGE_SHAPE } }),
    ] },
    reading: {},
  }))
  T(`${UNIT}: a record with no readable count or time is skipped`, unusable.spentWeighted === 100_000, String(unusable.spentWeighted))
}

const readingCases = () => {
  const rows = scenario({ files: { "a/session.jsonl": [call({ id: "m1", at: RESET + HOUR, output: 20_000 }), call({ id: "m2", at: RESET + 3 * HOUR, output: 20_000 })] } })
  const reading = takeReading({ pace: rows.pace, percent: 20, readAtMs: RESET + 2 * HOUR })
  same(`${UNIT}: a reading divides the spend of the week at that time by its share`, [reading.spentWeighted, reading.weeklyBudget, reading.readAt], [100_000, 500_000, iso(RESET + 2 * HOUR)])
  const refusal = (percent, readAtMs) => {
    try { takeReading({ pace: rows.pace, percent, readAtMs }) } catch (error) { return error.message }
    return ""
  }
  T(`${UNIT}: a reading of 0 percent is refused`, /above 0 and up to 100/.test(refusal(0, RESET + HOUR)), refusal(0, RESET + HOUR))
  T(`${UNIT}: a reading with no spend in its week cannot give a budget`, /no spend found/.test(refusal(20, RESET - 2 * HOUR)), refusal(20, RESET - 2 * HOUR))
  const path = calibrationPath(rows.repoRoot)
  writeCalibration(path, reading)
  same(`${UNIT}: a stored reading is read back`, readCalibration(path), reading)
  writeCalibration(path, { ...reading, percent: 40, weeklyBudget: 250_000 })
  same(`${UNIT}: a new reading replaces the stored one`, [readCalibration(path).percent, readCalibration(path).weeklyBudget], [40, 250_000])
  const readFailure = (text) => {
    writeFileSync(path, text)
    try { readCalibration(path) } catch (error) { return error.message }
    return ""
  }
  T(`${UNIT}: a stored reading that is not JSON stops the launch instead of passing as no reading`, /is not JSON/.test(readFailure("{")), readFailure("{"))
  T(`${UNIT}: a stored reading without a budget stops the launch`, /is not a reading/.test(readFailure(JSON.stringify({ percent: 40 }))))
  T(`${UNIT}: a missing calibration file is no reading`, readCalibration(join(rows.repoRoot, "absent.json")) === null)
  T(`${UNIT}: a directory that does not exist holds no spend`, weightedSpend({ pace: { ...rows.pace, transcriptRoot: join(root, "pace-governor", "absent") }, sinceMs: RESET, untilMs: RESET + HOUR }) === 0)
}

const awaitCases = async () => {
  const config = { pace: { ...realOrchestratorConfig().pace, enabled: true, recheckMinutes: 5 } }
  const verdicts = [
    { decision: PACE_DECISIONS.holdLine, wakeAt: iso(RESET + 30 * 60_000), reason: "over" },
    { decision: PACE_DECISIONS.holdLine, wakeAt: iso(RESET + 30 * 60_000 + 60_000), reason: "over" },
    { decision: PACE_DECISIONS.holdCap, wakeAt: null, reason: "cap" },
    { decision: PACE_DECISIONS.holdLine, wakeAt: iso(RESET + 10 * HOUR), reason: "over" },
    { decision: PACE_DECISIONS.admit, wakeAt: null, reason: "under" },
  ]
  const sleeps = []
  const events = []
  let clock = RESET
  const result = await awaitPace({
    config, now: () => clock, read: () => verdicts.shift(),
    sleep: async (milliseconds) => { sleeps.push(milliseconds); clock += milliseconds },
    holdAt: (verdict) => events.push(`hold ${verdict.decision}`), release: () => events.push("release"),
  })
  same(`${UNIT}: a hold waits for the line, at least the recheck time and at most one hour, then reads the spend again`, sleeps, [30 * 60_000, 5 * 60_000, 5 * 60_000, HOUR])
  same(`${UNIT}: each hold registers its wake and the admit clears it`, events, ["hold HOLD_LINE", "hold HOLD_LINE", "hold HOLD_CAP", "hold HOLD_LINE", "release"])
  T(`${UNIT}: the wait reports how long the launch was held`, result.heldMs === 30 * 60_000 + 10 * 60_000 + HOUR && result.decision === "ADMIT", JSON.stringify(result))

  let read = false
  const disabled = await awaitPace({ config: { pace: { ...config.pace, enabled: false } }, read: () => { read = true } })
  T(`${UNIT}: a disabled governor admits and reads nothing`, disabled.enabled === false && disabled.decision === "ADMIT" && read === false)
}

const sleeperProcess = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore" })

const countCases = async () => {
  const checkout = join(root, "pace-governor", "count")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  const children = [sleeperProcess(), sleeperProcess(), sleeperProcess(), sleeperProcess()]
  try {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const register = (child, extra) => registerWakeSource({ pid: child.pid, workerPid: null, startedAt: iso(Date.now()), ...extra }, checkout)
    const pending = () => ({ pending: true, pendingAt: iso(Date.now()) })
    register(children[0], { what: "worker #1", research: false, review: false, ...pending() })
    register(children[1], { what: "review", research: false, review: true, ...pending() })
    register(children[2], { what: "pace hold: worker #2", research: false, review: false, paceHold: true, wakeAt: iso(Date.now() + HOUR) })
    register(children[3], { kind: "file-waiter", what: "waiting" })
    same(`${UNIT}: a worker and a review count toward the cap, a pace hold and a waiter do not`, [readWakeSourceStates(checkout).live.length, countLiveLaunchers(checkout)], [4, 2])
  } finally {
    for (const child of children) child.kill("SIGKILL")
  }
}

/**
 * A staged launcher reads the real clock, so the fixture takes the share of the week that has passed now.
 * `spentOfLine` is the spend as a multiple of the line: 0.5 is under it, 2 is over it.
 */
const liveFixture = (label, spentOfLine) => {
  const nowMs = Date.now()
  const config = launchConfig(stubEngine(stage("pace-governor/immediate-worker.js", "process.exit(0)\n")))
  const transcripts = join(root, "pace-governor", `${label}-projects`)
  const spentWeighted = 1_000_000
  mkdirSync(transcripts, { recursive: true })
  const transcript = join(transcripts, "session.jsonl")
  writeFileSync(transcript, `${call({ id: `${label}-1`, at: nowMs - 1000, output: spentWeighted / 5 })}\n`)
  utimesSync(transcript, new Date(nowMs), new Date(nowMs))
  const pace = { ...config.pace, enabled: true, transcriptRoot: transcripts }
  const fixture = launch(`pace-${label}`, { ...config, pace })
  const elapsedShare = (nowMs - weekWindow(nowMs, pace.weeklyReset).startMs) / WEEK
  writeCalibration(join(fixture.base, ".git", "orbit-pace-calibration.json"), {
    percent: 10, readAt: iso(nowMs), weeklyBudget: spentWeighted / (elapsedShare * spentOfLine), weights: weightsFingerprint(pace),
  })
  return { fixture, argv: ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt] }
}

const parse = (text) => {
  try { return JSON.parse(text) } catch { return {} }
}

const launcherCases = async () => {
  const underLine = liveFixture("under", 0.5)
  const overLine = liveFixture("over", 2)

  const underPlan = parse(run("launch-worker.mjs", [...underLine.argv, "--dry-run"], { path: underLine.fixture.path }).stdout)
  T("launch-worker.mjs: a dry run under the line prints the pace verdict and admits", underPlan.pace?.enabled === true && underPlan.pace.decision === "ADMIT" && underPlan.pace.overLine === false, JSON.stringify(underPlan.pace))
  const overStarted = Date.now()
  const overPlan = parse(run("launch-worker.mjs", [...overLine.argv, "--dry-run"], { path: overLine.fixture.path }).stdout)
  T("launch-worker.mjs: a dry run over the line prints the hold and does not wait", overPlan.pace?.decision === "HOLD_LINE" && Date.parse(overPlan.pace.wakeAt) > overStarted && Date.now() - overStarted < 20_000, JSON.stringify(overPlan.pace))
  const researchOrder = stage("pace-governor/research-order.md", "Research the pace rule.\n")
  const researchPlan = parse(run("launch-worker.mjs", ["--research", "--order", researchOrder, "--out", join(dirname(researchOrder), "findings.md"), "--dry-run"], { path: overLine.fixture.path }).stdout)
  T("launch-worker.mjs: a research dry run goes through the same governor", researchPlan.pace?.decision === "HOLD_LINE", JSON.stringify(researchPlan.pace))

  const admitted = run("launch-worker.mjs", underLine.argv, { path: underLine.fixture.path, env: githubAuthEnv() })
  const admittedBody = parse(admitted.stdout)
  if (admittedBody.logFile) rmSync(admittedBody.logFile, { force: true })
  T("launch-worker.mjs: a launch under the line passes the governor and runs the worker", admitted.status === 0 && admittedBody.outcome === "EXITED" && /pace admits/.test(admitted.stderr), `${admitted.status} ${admitted.stderr} ${admitted.stdout}`)
  T("launch-worker.mjs: an admitted launch leaves no pace hold behind", readWakeSourceStates(underLine.fixture.base).live.length === 0)

  const held = spawn(process.execPath, [overLine.fixture.path, ...overLine.argv], { cwd: dirname(overLine.fixture.path), env: { ...process.env, ...githubAuthEnv() }, stdio: ["ignore", "pipe", "pipe"] })
  let heldError = ""
  held.stderr.on("data", (chunk) => { heldError += chunk })
  try {
    let wake = null
    const deadline = Date.now() + 30_000
    while (wake === null && Date.now() < deadline) {
      wake = readWakeSourceStates(overLine.fixture.base).live.find((source) => source.paceHold === true) ?? null
      if (wake === null) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    T("launch-worker.mjs: a launch over the line holds and registers a wake for the time the line catches up",
      wake !== null && wake.pid === held.pid && wake.decision === "HOLD_LINE" && Date.parse(wake.wakeAt) > Date.now() && wake.workerPid === null, JSON.stringify({ wake, heldError }))
    const launchDirectory = join(overLine.fixture.worktree, ".git", "orbit-worker-launches")
    T("launch-worker.mjs: a held launch records no launch, reserves no slot and runs no worker",
      !existsSync(join(overLine.fixture.base, ".git", "orbit-launch-gate.json")) && (!existsSync(launchDirectory) || readdirSync(launchDirectory).filter((name) => name.endsWith(".json")).length === 0) && /pace holds \(HOLD_LINE\)/.test(heldError), heldError)
    T("launch-worker.mjs: a held launch is no worker for the cap", countLiveLaunchers(overLine.fixture.base) === 0)
  } finally {
    held.kill("SIGKILL")
    await new Promise((resolve) => held.on("close", resolve))
  }
}

const statusCases = () => {
  const rows = scenario({ files: oneCall(20_000, Date.now() - 1000), reading: { readAt: iso(Date.now()), weeklyBudget: 1e15 } })
  const pace = paceOfStatus({ config: rows.config, repoRoot: rows.repoRoot })
  T("run-status.mjs: the status prints the week share spent, the line and the hours of headroom",
    pace.enabled === true && pace.spentShare === 0 && pace.lineShare > 0 && pace.headroomHours > 0 && pace.decision === "ADMIT" && /owner reading/.test(pace.calibration), JSON.stringify(pace))
  const empty = scenario({ files: {} })
  const noReading = paceOfStatus({ config: empty.config, repoRoot: empty.repoRoot })
  T("run-status.mjs: with no stored reading the status says so", noReading.decision === "ADMIT" && /no owner reading is stored/.test(noReading.calibration), JSON.stringify(noReading))
  T("run-status.mjs: a disabled governor prints that it is off", paceOfStatus({ config: { pace: hermeticPace() } }).enabled === false)
  writeFileSync(calibrationPath(rows.repoRoot), "{")
  T("run-status.mjs: an unreadable reading is reported, not dropped", /is not JSON/.test(paceOfStatus({ config: rows.config, repoRoot: rows.repoRoot }).error ?? ""))
}

export const cases = async () => {
  tableCases()
  readingCases()
  await awaitCases()
  await countCases()
  await launcherCases()
  statusCases()
}
