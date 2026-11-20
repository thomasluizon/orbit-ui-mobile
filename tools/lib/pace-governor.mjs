/**
 * The pace governor compares the weighted token spend since the last weekly reset of the main account
 * with a linear budget line, and it holds a launch that is over the line. Transcript fields come from
 * real records: `type`, `isSidechain`, `timestamp` and `message.{id, model, usage}`. A streamed call
 * writes several records with one `message.id`, and the last one wins. A subagent file counts too.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

import { cacheWritesByTtl } from "./relay-cost.mjs"
import { gitDirectoryOf, isRelayWaiter, readWakeSourceStates, REPO_ROOT } from "./run-state.mjs"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const WEEK_HOURS = WEEK_MS / HOUR_MS

/** The exit code of a launcher that the governor still holds at its maximum wait. */
export const PACE_HOLD_EXIT = 9

export const PACE_DECISIONS = Object.freeze({ admit: "ADMIT", holdLine: "HOLD_LINE", holdCap: "HOLD_CAP" })

/** The weekly window that holds `nowMs`. A call exactly at the reset belongs to the new week. */
export const weekWindow = (nowMs, reset) => {
  const offsetMs = reset.utcOffsetMinutes * MINUTE_MS
  const local = new Date(nowMs + offsetMs)
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const daysSinceResetDay = (local.getUTCDay() - reset.weekday + 7) % 7
  let resetLocal = localMidnight - daysSinceResetDay * DAY_MS + (reset.hour * 60 + reset.minute) * MINUTE_MS
  if (resetLocal > local.getTime()) resetLocal -= WEEK_MS
  const startMs = resetLocal - offsetMs
  return { startMs, nextResetMs: startMs + WEEK_MS }
}

/** The weight of one model: the first configured name that its id contains, else the default. */
const modelWeightOf = (model, modelWeights) => {
  const id = typeof model === "string" ? model.toLowerCase() : ""
  const name = Object.keys(modelWeights).find((key) => key !== "default" && id.includes(key))
  return modelWeights[name ?? "default"]
}

const weightedTokensOf = (usage, model, pace) => {
  const writes = cacheWritesByTtl(usage)
  const { tokenWeights } = pace
  const tokens = usage.input_tokens * tokenWeights.input + writes.cacheWrite5m * tokenWeights.cacheWrite5m +
    writes.cacheWrite1h * tokenWeights.cacheWrite1h + usage.cache_read_input_tokens * tokenWeights.cacheRead +
    usage.output_tokens * tokenWeights.output
  return tokens * modelWeightOf(model, pace.modelWeights)
}

const jsonlFilesChangedSince = (directory, sinceMs, found = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) jsonlFilesChangedSince(path, sinceMs, found)
    // A file last written before the window cannot hold a record inside it.
    else if (entry.name.endsWith(".jsonl") && statSync(path).mtimeMs >= sinceMs) found.push(path)
  }
  return found
}

const expandHome = (path) => path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path

/**
 * The weighted spend of every assistant call with a timestamp in [sinceMs, untilMs]. A directory that
 * does not exist holds no spend, which is the state of a machine that never ran Claude.
 */
export const weightedSpend = ({ pace, sinceMs, untilMs }) => {
  const root = expandHome(pace.transcriptRoot)
  if (!existsSync(root)) return 0
  const calls = new Map()
  for (const file of jsonlFilesChangedSince(root, sinceMs)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      // The cheap test skips the large request blobs that carry no usage.
      if (!line.includes('"usage"')) continue
      let record
      try { record = JSON.parse(line) } catch { continue }
      const usage = record?.message?.usage
      const at = Date.parse(record?.timestamp)
      if (record?.type !== "assistant" || typeof record.message?.id !== "string" || !usage || !Number.isFinite(at)) continue
      if (![usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens].every((value) => Number.isInteger(value) && value >= 0)) continue
      if (at < sinceMs || at > untilMs) continue
      calls.set(record.message.id, weightedTokensOf(usage, record.message.model, pace))
    }
  }
  let total = 0
  for (const weighted of calls.values()) total += weighted
  return total
}

/** The units of a stored budget. A reading taken under other weights does not compare with this spend. */
export const weightsFingerprint = (pace) => JSON.stringify({ tokenWeights: pace.tokenWeights, modelWeights: pace.modelWeights })

/**
 * The calibration file lives in the common Git directory, so every worktree of the repository reads
 * the one owner reading. A checkout with no Git directory (a staged copy) keeps it in its own marker.
 */
export const calibrationPath = (repoRoot = REPO_ROOT) => {
  const common = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", windowsHide: true })
  const directory = common.status === 0 && common.stdout.trim() !== "" ? common.stdout.trim() : gitDirectoryOf(repoRoot)
  return join(directory, "orbit-pace-calibration.json")
}

/** The stored reading, or null when none exists. A file that cannot be read stops the caller: it is no reading. */
export const readCalibration = (path) => {
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw new Error(`cannot read the pace calibration ${path}: ${error.message}`, { cause: error })
  }
  let reading
  try { reading = JSON.parse(text) } catch (error) { throw new Error(`the pace calibration ${path} is not JSON: ${error.message}`, { cause: error }) }
  const valid = reading !== null && typeof reading === "object" && Number.isFinite(reading.percent) && reading.percent > 0 && reading.percent <= 100 &&
    Number.isFinite(Date.parse(reading.readAt)) && Number.isFinite(reading.weeklyBudget) && reading.weeklyBudget > 0 && typeof reading.weights === "string"
  if (!valid) throw new Error(`the pace calibration ${path} is not a reading: it needs percent, readAt, weeklyBudget and weights`)
  return reading
}

/** A new reading replaces the stored one. The budget is the spend of the week at the reading, divided by its share. */
export const takeReading = ({ pace, percent, readAtMs }) => {
  if (!(Number.isFinite(percent) && percent > 0 && percent <= 100)) throw new Error(`the reading must be a percentage above 0 and up to 100, got ${percent}`)
  if (!Number.isFinite(readAtMs)) throw new Error("the reading needs a valid time")
  const { startMs } = weekWindow(readAtMs, pace.weeklyReset)
  const spentWeighted = weightedSpend({ pace, sinceMs: startMs, untilMs: readAtMs })
  if (!(spentWeighted > 0)) throw new Error(`no spend found from ${new Date(startMs).toISOString()} to ${new Date(readAtMs).toISOString()} under ${expandHome(pace.transcriptRoot)}, so no budget can be derived`)
  return { percent, readAt: new Date(readAtMs).toISOString(), spentWeighted, weeklyBudget: spentWeighted / (percent / 100), weights: weightsFingerprint(pace) }
}

export const writeCalibration = (path, reading) => {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(`${path}.${process.pid}.unpublished`, `${JSON.stringify(reading, null, 2)}\n`)
  renameSync(`${path}.${process.pid}.unpublished`, path)
}

const round = (value, digits) => Number(value.toFixed(digits))

const NEW_READING = "node tools/pace-calibrate.mjs --percent <weekly percent shown by the plan>"

/** Names the stored reading the governor uses, and why that reading may not fit this week. */
const calibrationState = ({ calibration, pace, windowStartMs }) => {
  if (calibration === null) {
    return { state: "NONE", note: `no owner reading is stored, so the governor cannot compare the spend with a line and admits; run ${NEW_READING}` }
  }
  const stored = { readAt: calibration.readAt, percent: calibration.percent, weeklyBudget: round(calibration.weeklyBudget, 0) }
  if (calibration.weights !== weightsFingerprint(pace)) {
    return { ...stored, state: "OTHER_WEIGHTS", note: `the stored reading of ${calibration.readAt} used other token weights, so its budget is in other units; the governor admits until a new reading: ${NEW_READING}` }
  }
  if (Date.parse(calibration.readAt) < windowStartMs) {
    return { ...stored, state: "PREVIOUS_WEEK", note: `no reading was taken this week; the governor uses the stored reading of ${calibration.readAt} (${calibration.percent}%)` }
  }
  return { ...stored, state: "CURRENT_WEEK", note: `the governor uses the owner reading of ${calibration.readAt} (${calibration.percent}%)` }
}

const capReason = (liveWorkers, pace) => `${liveWorkers} live launchers, the cap is ${pace.workerCap}`

/**
 * The pure verdict. The line is the share of the week that has passed, times the weekly budget. At
 * or under it the launch is admitted up to `workerCap` live launchers. Over it, the launch waits until
 * the line catches up with the spend, which is at the latest the next reset.
 */
const paceVerdict = ({ pace, calibration, spentWeighted, nowMs, liveWorkers }) => {
  const { startMs, nextResetMs } = weekWindow(nowMs, pace.weeklyReset)
  const elapsedShare = (nowMs - startMs) / WEEK_MS
  const calibrated = calibrationState({ calibration, pace, windowStartMs: startMs })
  const capped = liveWorkers >= pace.workerCap
  const base = {
    windowStart: new Date(startMs).toISOString(), nextReset: new Date(nextResetMs).toISOString(), lineShare: round(elapsedShare, 4),
    spentWeighted: round(spentWeighted, 0), liveWorkers, workerCap: pace.workerCap, calibration: calibrated,
  }
  if (calibrated.state !== "CURRENT_WEEK" && calibrated.state !== "PREVIOUS_WEEK") {
    return { ...base, spentShare: null, headroomHours: null, overLine: null, wakeAt: null,
      decision: capped ? PACE_DECISIONS.holdCap : PACE_DECISIONS.admit, reason: capped ? capReason(liveWorkers, pace) : calibrated.note }
  }
  const spentShare = spentWeighted / calibration.weeklyBudget
  const overLine = spentShare > elapsedShare
  const verdict = { ...base, spentShare: round(spentShare, 4), headroomHours: round((elapsedShare - spentShare) * WEEK_HOURS, 2), overLine, wakeAt: null }
  if (overLine) {
    const catchUpMs = Math.min(startMs + spentShare * WEEK_MS, nextResetMs)
    return { ...verdict, wakeAt: new Date(catchUpMs).toISOString(), decision: PACE_DECISIONS.holdLine,
      reason: `the week spent ${round(spentShare * 100, 1)}% against a line of ${round(elapsedShare * 100, 1)}%; the line catches up at ${new Date(catchUpMs).toISOString()}` }
  }
  return { ...verdict, decision: capped ? PACE_DECISIONS.holdCap : PACE_DECISIONS.admit,
    reason: capped ? capReason(liveWorkers, pace) : `${verdict.headroomHours} hours under the line` }
}

/** A wake source of a launcher names whether it is research or a read-only run. A pace hold is not a worker. */
const isLauncherSource = (source) => typeof source?.research === "boolean" && typeof source.review === "boolean" &&
  source.paceHold !== true && !isRelayWaiter(source)

export const countLiveLaunchers = (repoRoot = REPO_ROOT) => {
  const { live, orphaned } = readWakeSourceStates(repoRoot)
  return live.filter(isLauncherSource).length + orphaned.filter(isLauncherSource).length
}

/** Reads the transcripts, the stored reading and the live launchers, then returns the verdict. */
export const readPace = ({ config, repoRoot = REPO_ROOT, nowMs = Date.now(), liveWorkers = countLiveLaunchers(repoRoot) }) => {
  const { pace } = config
  const { startMs } = weekWindow(nowMs, pace.weeklyReset)
  const calibration = readCalibration(calibrationPath(repoRoot))
  return paceVerdict({ pace, calibration, spentWeighted: weightedSpend({ pace, sinceMs: startMs, untilMs: nowMs }), nowMs, liveWorkers })
}

/**
 * Waits until the verdict admits, for at most `pace.maxHoldMinutes`. A line hold sleeps until the line
 * catches up and then reads the spend again, because the coordinator and the live workers kept spending.
 * `holdAt` registers the wake for each hold verdict, and `release` clears it. A hold that outlasts the
 * maximum returns the last verdict with `expired` true. Nothing here records a launch.
 */
export const awaitPace = async ({ config, repoRoot = REPO_ROOT, now = Date.now, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  read = readPace, holdAt = () => {}, release = () => {}, log = () => {} }) => {
  if (config.pace.enabled !== true) return { decision: PACE_DECISIONS.admit, enabled: false, heldMs: 0 }
  const startedMs = now()
  const recheckMs = config.pace.recheckMinutes * MINUTE_MS
  const deadlineMs = startedMs + config.pace.maxHoldMinutes * MINUTE_MS
  let announced = null
  for (;;) {
    const verdict = read({ config, repoRoot, nowMs: now() })
    if (verdict.decision === PACE_DECISIONS.admit) {
      release()
      log(`pace admits: ${verdict.reason}`)
      return { ...verdict, enabled: true, heldMs: now() - startedMs }
    }
    if (announced !== verdict.decision) {
      log(`pace holds (${verdict.decision}): ${verdict.reason}`)
      announced = verdict.decision
    }
    const remainingMs = deadlineMs - now()
    if (remainingMs <= 0) {
      release()
      return { ...verdict, enabled: true, expired: true, heldMs: now() - startedMs }
    }
    holdAt(verdict)
    const untilMs = verdict.wakeAt === null ? 0 : Date.parse(verdict.wakeAt) - now()
    // The spend moves while a launch waits, so no wait lasts longer than one hour.
    await sleep(Math.min(Math.max(untilMs, recheckMs), HOUR_MS, remainingMs))
  }
}
