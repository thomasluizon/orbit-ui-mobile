#!/usr/bin/env node
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

const WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1000
/**
 * A reservation is a LEASE, not a permanent claim. `reserve` appends a row carrying no
 * measurement and `record` or `cancel` closes it, so anything that kills the launcher in
 * between leaves that row open forever, and every ledger row written before reservations
 * carried `pending` is open by construction. An expired lease holds no budget and never
 * fails the fuse closed.
 *
 * Expiry reads the clock AND the worker process, and liveness can only ever expire a
 * reservation earlier, never hold one open past the backstop. Both directions of a clock-only
 * answer are wrong: expiring a live worker's reservation stops counting real projected spend
 * and can authorise a launch past the budget, while never expiring a dead one poisons the fuse
 * for the whole seven-day window. A recorded `workerPid` settles the first: `process.kill(pid,
 * 0)` sends no signal and throws ESRCH when the process is gone, EPERM when it exists but is
 * not ours, so EPERM is alive. Both errnos confirmed by running it. The clock still settles the
 * second, because the operating system recycles pids and a liveness-only answer would let one
 * recycled pid hold the fuse forever.
 *
 * The two populations need OPPOSITE lease lengths, so one global TTL is wrong for one of them.
 * A row carrying a PID is paying for a process that demonstrably started, so its clock arm is
 * only the recycled-pid terminator and must clear the longest real session. A row carrying NO
 * PID was never claimed, which means the worker it was paying for either never started or died
 * before it could be recorded; that row is stranded by definition and wants a short lease. The
 * whole truth table, with no case left unterminated:
 *
 *   PID alive, inside the backstop   holds its reserved tokens   the real 14.9 hour session
 *   PID alive, past the backstop     expires                     a recycled pid, never immortal
 *   PID gone, any age                expires at once             the killed worker, fast path
 *   no PID, inside the lease         holds                       a launcher still mid-setup
 *   no PID, past the lease           expires                     every legacy row
 *
 * Both numbers are derived, neither is a round guess. The backstop is 16 hours because 275 codex
 * rollouts measured on this machine, first to last event per session, give p50 8.1 min, p90
 * 3.8 h, p95 6.8 h, p99 13.4 h and max 14.9 h, which 16 hours clears with margin. The unclaimed
 * lease is 2 hours because the gap it covers is reserve to claim, which is bounded by worktree
 * creation and dependency install rather than by the worker's runtime, so two hours is already
 * orders of magnitude of margin. Applying the 16 hour figure to unclaimed rows was measured
 * wrong: it re-poisoned the fuse against the real production ledger for up to 16 hours.
 */
const CLAIMED_RESERVATION_BACKSTOP_MILLISECONDS = 16 * 60 * 60 * 1000
const UNCLAIMED_RESERVATION_LEASE_MILLISECONDS = 2 * 60 * 60 * 1000
const ENGINES = new Set(["claude", "codex"])
const TIERS = new Set(["routine", "reserved"])
const DEFAULT_LEDGER_PATH = resolve(homedir(), ".orbit", "automation-budget.jsonl")
const USAGE = `usage:
  automation-budget.mjs check --engine <claude|codex> --identity <id> --tier <routine|reserved> --reset-at <timestamp> --warning-tokens <count> --budget-tokens <count> --invocation-tokens <count> [--ledger <path>] [--json]
  automation-budget.mjs reserve --engine <claude|codex> --identity <id> --tier <routine|reserved> --started-at <timestamp> --ended-at <timestamp> --reset-at <timestamp> --warning-tokens <count> --budget-tokens <count> --invocation-tokens <count> [--account-used-percent <percent> --account-observed-at <timestamp>] [--ledger <path>] [--json]
  automation-budget.mjs record --identity <id> --engine <claude|codex> --tier <routine|reserved> --started-at <timestamp> --ended-at <timestamp> [--input-tokens <count> --cached-input-tokens <count>] [--output-tokens <count>] [--provider-estimated-cost <amount>] [--account-used-percent <percent> --account-observed-at <timestamp>] [--ledger <path>] [--json]
  automation-budget.mjs claim --identity <id> --engine <claude|codex> --tier <routine|reserved> --started-at <timestamp> --ended-at <timestamp> --invocation-tokens <count> --worker-pid <pid> [--ledger <path>] [--json]
  automation-budget.mjs cancel --identity <id> --engine <claude|codex> --tier <routine|reserved> --started-at <timestamp> --ended-at <timestamp> [--ledger <path>] [--json]
  automation-budget.mjs report --engine <claude|codex> --reset-at <timestamp> [--ledger <path>] [--json]

  check          evaluate an invocation against the current engine's token budget
  reserve        atomically evaluate and append a pending invocation before launch mutation
  record         append one invocation observation to the ledger
  claim          re-append an open reservation carrying the worker PID now running it
  cancel         append a tombstone for a pending invocation proven not to have started
  report         print one engine's current seven-day token totals, missing identities, and expired reservations
  --identity     stable identity for the invocation
  --engine       quota pool charged by the invocation; engines are never combined
  --tier         routine automation; legacy reserved ledger rows remain readable
  --started-at   invocation start as ISO-8601 with a timezone, or Unix seconds
  --ended-at     invocation end as ISO-8601 with a timezone, or Unix seconds
  --input-tokens measured provider input tokens; omitted while measurement is unavailable
  --output-tokens
                  measured provider output tokens; omitted while measurement is unavailable
  --cached-input-tokens
                  provider cache-read input tokens, retained with the raw provider measurement
                  and subtracted from it, because a cache read is not fresh spend
  --provider-estimated-cost
                  optional provider-estimated monetary cost; reporting context only
  --account-used-percent
                  optional account usage observation from 0 to 100; reporting context only
  --account-observed-at
                  timestamp paired with --account-used-percent
  --reset-at     end of the current weekly window as ISO-8601 with a timezone, or Unix seconds
  --budget-tokens
                  positive token budget for the current engine and window
  --warning-tokens
                  non-negative token warning level below the engine budget
  --invocation-tokens
                  non-negative token reservation for the proposed invocation
  --worker-pid   process id of the worker this reservation is paying for; while it is alive the
                  reservation never expires, and once it is gone the reservation expires at once
  --ledger       JSONL ledger path; defaults to ORBIT_AUTOMATION_BUDGET_LEDGER or ${DEFAULT_LEDGER_PATH}
  --json         emit the command result as JSON; without it check and record are quiet on success
  --help, -h     print this usage and exit 0

The fuse blocks automation when measured spend, every live reservation, and the proposed
reservation would exceed the token budget. Measured spend is UNCACHED input plus output: a
record's cachedInputTokens are subtracted from its inputTokens, because a cache read is not
fresh spend. The fuse fails closed when the latest in-window record for any identity lacks
either token measurement.
Duplicate identities are append-only; the latest in-window record is authoritative. A cancelled
pending invocation contributes no tokens. A reservation is a lease. One that recorded a worker PID
expires the moment that process is gone, and in any case once its end timestamp is more than
${CLAIMED_RESERVATION_BACKSTOP_MILLISECONDS / 3_600_000} hours old, which terminates a recycled PID. One that never recorded a PID was never
confirmed spawned, so it expires once its end timestamp is more than ${UNCLAIMED_RESERVATION_LEASE_MILLISECONDS / 3_600_000} hours old. An expired
reservation holds no budget and no longer fails the fuse closed. Account usage percentage
and estimated cost are context only and never affect token totals. Records are attributed to the
seven-day window containing their end timestamp. Mutations share an adjacent lock file and fail
closed on lock contention.

exit codes:
  0  success or permitted invocation
  2  invalid command-line input
  3  ledger read, validation, lock, append, claim, or incomplete-measurement failure
  4  routine invocation blocked because its token reservation would exceed the budget`

let releaseActiveLock = null

const fail = (message, code) => {
  console.error(`automation-budget: ${message}`)
  if (releaseActiveLock) {
    const release = releaseActiveLock
    releaseActiveLock = null
    release()
  }
  process.exit(code)
}

const parseArguments = (argumentsList) => {
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
    console.log(USAGE)
    process.exit(0)
  }
  const command = argumentsList[0]
  if (!["check", "reserve", "record", "claim", "cancel", "report"].includes(command)) fail(`expected check, reserve, record, claim, cancel, or report\n\n${USAGE}`, 2)
  const values = new Map()
  const switches = new Set()
  for (let index = 1; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === "--json") {
      if (switches.has(argument)) fail(`duplicate argument ${argument}`, 2)
      switches.add(argument)
      continue
    }
    if (![
      "--identity",
      "--engine",
      "--tier",
      "--started-at",
      "--ended-at",
      "--input-tokens",
      "--cached-input-tokens",
      "--output-tokens",
      "--provider-estimated-cost",
      "--account-used-percent",
      "--account-observed-at",
      "--reset-at",
      "--warning-tokens",
      "--budget-tokens",
      "--invocation-tokens",
      "--worker-pid",
      "--ledger",
    ].includes(argument)) {
      fail(`unknown argument ${argument}\n\n${USAGE}`, 2)
    }
    if (values.has(argument)) fail(`duplicate argument ${argument}`, 2)
    const value = argumentsList[++index]
    if (value === undefined || value === "" || value.startsWith("--")) fail(`${argument} requires a value`, 2)
    values.set(argument, value)
  }
  return { command, values, json: switches.has("--json") }
}

const requireValue = (values, flag) => {
  const value = values.get(flag)
  if (value === undefined) fail(`${flag} is required`, 2)
  return value
}

const rejectUnexpected = (values, allowedFlags) => {
  for (const flag of values.keys()) {
    if (!allowedFlags.has(flag)) fail(`${flag} is not valid for this command`, 2)
  }
}

const parseEngine = (value) => {
  if (!ENGINES.has(value)) fail(`--engine must be claude or codex`, 2)
  return value
}

const parseTier = (value) => {
  if (!TIERS.has(value)) fail(`--tier must be routine or reserved`, 2)
  return value
}

const parseTimestamp = (value, flag, failureCode = 2) => {
  let milliseconds
  if (/^\d+$/.test(String(value))) {
    const seconds = Number(value)
    if (!Number.isSafeInteger(seconds) || seconds <= 0) fail(`${flag} must be an ISO-8601 timestamp with a timezone or positive Unix seconds`, failureCode)
    milliseconds = seconds * 1000
  } else {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/)
    if (!match) {
      fail(`${flag} must be an ISO-8601 timestamp with a timezone or positive Unix seconds`, failureCode)
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", fractionText = "0", , offsetSign, offsetHourText = "0", offsetMinuteText = "0"] = match
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)
    const second = Number(secondText)
    const fraction = Number(fractionText.padEnd(3, "0"))
    const offsetHour = Number(offsetHourText)
    const offsetMinute = Number(offsetMinuteText)
    const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0
    if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) {
      fail(`${flag} is not a valid timestamp`, failureCode)
    }
    const offsetMilliseconds = (offsetHour * 60 + offsetMinute) * 60 * 1000 * (offsetSign === "-" ? -1 : 1)
    milliseconds = Date.UTC(year, month - 1, day, hour, minute, second, fraction) - offsetMilliseconds
  }
  const timestamp = new Date(milliseconds)
  if (!Number.isFinite(timestamp.getTime())) fail(`${flag} is not a valid timestamp`, failureCode)
  return timestamp
}

const parseTokenCount = (value, flag, failureCode = 2, positive = false) => {
  if (!/^(?:0|[1-9]\d*)$/.test(String(value))) fail(`${flag} must be a ${positive ? "positive" : "non-negative"} integer`, failureCode)
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < (positive ? 1 : 0)) {
    fail(`${flag} must be a ${positive ? "positive" : "non-negative"} safe integer`, failureCode)
  }
  return count
}

const parseNonNegativeNumber = (value, flag, failureCode = 2) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value))) fail(`${flag} must be a non-negative number`, failureCode)
  const number = Number(value)
  if (!Number.isFinite(number)) fail(`${flag} must be a finite non-negative number`, failureCode)
  return number
}

const parsePercent = (value, flag, failureCode = 2) => {
  const percent = parseNonNegativeNumber(value, flag, failureCode)
  if (percent > 100) fail(`${flag} must be a number from 0 to 100`, failureCode)
  return percent
}

const parseIdentity = (value, failureCode = 2, label = "--identity") => {
  if (typeof value !== "string" || value.length > 200 || value.trim() !== value || value.length === 0 || /[\r\n\0]/.test(value)) {
    fail(`${label} must be 1 to 200 non-whitespace-bounded characters on one line`, failureCode)
  }
  return value
}

const ledgerPath = (values) => {
  const configuredPath = values.get("--ledger") ?? process.env.ORBIT_AUTOMATION_BUDGET_LEDGER ?? DEFAULT_LEDGER_PATH
  if (configuredPath.trim().length === 0) fail(`ORBIT_AUTOMATION_BUDGET_LEDGER must not be empty`, 2)
  return resolve(configuredPath)
}

const hasOwn = (value, property) => Object.prototype.hasOwnProperty.call(value, property)
const sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
const MALFORMED_LOCK_STALE_MILLISECONDS = 5_000

const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== "ESRCH"
  }
}

const unlinkLock = (path) => {
  try {
    unlinkSync(path)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    fail(`could not reclaim ledger lock ${path}: ${error.message}`, 3)
  }
}

const reclaimAbandonedLock = (path) => {
  let marker
  try {
    marker = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return true
    if (!(error instanceof SyntaxError)) {
      fail(`could not inspect ledger lock ${path}: ${error.message}`, 3)
    }
  }
  const pid = marker?.pid
  if (Number.isSafeInteger(pid) && pid > 0) {
    if (!processIsAlive(pid)) {
      unlinkLock(path)
      return true
    }
    return false
  }
  let modifiedAt
  try {
    modifiedAt = statSync(path).mtimeMs
  } catch (error) {
    if (error?.code === "ENOENT") return true
    fail(`could not inspect ledger lock ${path}: ${error.message}`, 3)
  }
  if (Date.now() - modifiedAt <= MALFORMED_LOCK_STALE_MILLISECONDS) return false
  unlinkLock(path)
  return true
}

const withLedgerLock = (path, action) => {
  const lockPath = `${path}.lock`
  const configuredTimeout = Number(process.env.AUTOMATION_BUDGET_TEST_LOCK_TIMEOUT_MS)
  const timeout = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10_000
  const deadline = Date.now() + timeout
  mkdirSync(dirname(path), { recursive: true })
  let descriptor
  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx", 0o600)
    } catch (error) {
      if (error?.code !== "EEXIST") fail(`could not acquire ledger lock ${lockPath}: ${error.message}`, 3)
      if (reclaimAbandonedLock(lockPath)) continue
      if (Date.now() >= deadline) {
        fail(`timed out waiting for ledger lock ${lockPath}; refusing to mutate the budget without an exclusive reservation`, 3)
      }
      sleep(25)
    }
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8")
  } catch (error) {
    closeSync(descriptor)
    try {
      unlinkSync(lockPath)
    } catch {}
    fail(`could not initialize ledger lock ${lockPath}: ${error.message}`, 3)
  }
  const release = () => {
    try {
      closeSync(descriptor)
    } catch {}
    try {
      unlinkSync(lockPath)
    } catch (error) {
      if (error?.code !== "ENOENT") console.error(`automation-budget: could not release ledger lock ${lockPath}: ${error.message}`)
    }
  }
  releaseActiveLock = release
  try {
    const marker = process.env.AUTOMATION_BUDGET_TEST_LOCK_MARKER
    const releaseMarker = process.env.AUTOMATION_BUDGET_TEST_LOCK_RELEASE
    if (marker && releaseMarker) {
      writeFileSync(marker, "locked\n", "utf8")
      const testDeadline = Date.now() + 10_000
      while (!existsSync(releaseMarker) && Date.now() < testDeadline) sleep(10)
      if (!existsSync(releaseMarker)) fail(`test lock release marker was not created`, 3)
    }
    return action()
  } finally {
    releaseActiveLock = null
    release()
  }
}

const validateRecord = (record, lineNumber) => {
  const prefix = `ledger line ${lineNumber}`
  if (record === null || Array.isArray(record) || typeof record !== "object") fail(`${prefix} must be a JSON object`, 3)
  const identity = parseIdentity(record.identity, 3, `${prefix} identity`)
  if (!ENGINES.has(record.engine)) fail(`${prefix} has an invalid engine`, 3)
  if (!TIERS.has(record.tier)) fail(`${prefix} has an invalid tier`, 3)
  const startedAt = parseTimestamp(record.startedAt, `${prefix} startedAt`, 3)
  const endedAt = parseTimestamp(record.endedAt, `${prefix} endedAt`, 3)
  if (startedAt.getTime() > endedAt.getTime()) fail(`${prefix} starts after it ends`, 3)
  const validated = {
    identity,
    engine: record.engine,
    tier: record.tier,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  }
  if (hasOwn(record, "cancelled")) {
    if (record.cancelled !== true) fail(`${prefix} cancelled must be true when present`, 3)
    if (
      hasOwn(record, "inputTokens") ||
      hasOwn(record, "outputTokens") ||
      hasOwn(record, "providerEstimatedCost") ||
      hasOwn(record, "accountContext")
    ) {
      fail(`${prefix} cancelled record must not carry measurements or context`, 3)
    }
    validated.cancelled = true
    return validated
  }
  if (hasOwn(record, "pending")) {
    if (record.pending !== true || !hasOwn(record, "reservedTokens")) fail(`${prefix} pending record must carry reservedTokens`, 3)
    validated.pending = true
    validated.reservedTokens = parseTokenCount(record.reservedTokens, `${prefix} reservedTokens`, 3)
    if (hasOwn(record, "workerPid")) {
      validated.workerPid = parseTokenCount(record.workerPid, `${prefix} workerPid`, 3, true)
    }
  } else if (hasOwn(record, "workerPid")) {
    fail(`${prefix} workerPid is only valid on a pending reservation`, 3)
  }
  if (hasOwn(record, "inputTokens")) {
    validated.inputTokens = parseTokenCount(record.inputTokens, `${prefix} inputTokens`, 3)
  }
  if (hasOwn(record, "cachedInputTokens")) {
    validated.cachedInputTokens = parseTokenCount(record.cachedInputTokens, `${prefix} cachedInputTokens`, 3)
    if (!hasOwn(record, "inputTokens") || validated.cachedInputTokens > validated.inputTokens) fail(`${prefix} cachedInputTokens must not exceed inputTokens`, 3)
  }
  if (hasOwn(record, "outputTokens")) {
    validated.outputTokens = parseTokenCount(record.outputTokens, `${prefix} outputTokens`, 3)
  }
  if (hasOwn(record, "providerEstimatedCost")) {
    validated.providerEstimatedCost = parseNonNegativeNumber(record.providerEstimatedCost, `${prefix} providerEstimatedCost`, 3)
  }
  if (hasOwn(record, "accountContext")) {
    const context = record.accountContext
    if (context === null || Array.isArray(context) || typeof context !== "object") {
      fail(`${prefix} accountContext must be an object`, 3)
    }
    if (context.scope !== "account" || context.attributed !== false) {
      fail(`${prefix} accountContext must declare scope account and attributed false`, 3)
    }
    validated.accountContext = {
      scope: "account",
      attributed: false,
      usedPercent: parsePercent(context.usedPercent, `${prefix} accountContext usedPercent`, 3),
      observedAt: parseTimestamp(context.observedAt, `${prefix} accountContext observedAt`, 3).toISOString(),
    }
  }
  return validated
}

const readLedger = (path) => {
  let contents
  try {
    contents = readFileSync(path, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return { records: [], needsSeparator: false }
    fail(`could not read ledger ${path}: ${error.message}`, 3)
  }
  if (contents.length === 0) return { records: [], needsSeparator: false }
  const needsSeparator = !contents.endsWith("\n")
  const lines = contents.split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  const records = lines.map((line, index) => {
    if (line.trim().length === 0) fail(`ledger line ${index + 1} is empty`, 3)
    let record
    try {
      record = JSON.parse(line)
    } catch {
      fail(`ledger line ${index + 1} is not valid JSON`, 3)
    }
    return validateRecord(record, index + 1)
  })
  return { records, needsSeparator }
}

const summarize = (records, engine, resetAt) => {
  const resetMilliseconds = resetAt.getTime()
  const windowStart = new Date(resetMilliseconds - WINDOW_MILLISECONDS)
  const claimedFloor = Date.now() - CLAIMED_RESERVATION_BACKSTOP_MILLISECONDS
  const unclaimedFloor = Date.now() - UNCLAIMED_RESERVATION_LEASE_MILLISECONDS
  const latestByIdentity = new Map()
  for (const record of records) {
    const endedMilliseconds = Date.parse(record.endedAt)
    if (record.engine !== engine || endedMilliseconds < windowStart.getTime() || endedMilliseconds >= resetMilliseconds) continue
    latestByIdentity.set(record.identity, record)
  }
  let inputTokens = 0
  let outputTokens = 0
  let routineTokens = 0
  let reservedTokens = 0
  const missingIdentities = []
  const expiredIdentities = []
  let pendingTokens = 0
  for (const record of latestByIdentity.values()) {
    if (record.cancelled === true) continue
    const open = record.pending === true || !hasOwn(record, "inputTokens") || !hasOwn(record, "outputTokens")
    if (open) {
      /**
       * A claimed row expires on EITHER its dead process or the recycled-pid backstop, never on
       * liveness alone, because the operating system recycles pids and a liveness-only answer
       * would let one recycled pid hold the fuse for the whole window. An unclaimed row has no
       * process to ask, so its own much shorter lease is the only terminator. `endedAt` is
       * always a validated ISO timestamp here because `validateRecord` reparses it and exits 3
       * on anything else, so neither comparison can silently be NaN.
       */
      const endedMilliseconds = Date.parse(record.endedAt)
      const expired = hasOwn(record, "workerPid")
        ? !processIsAlive(record.workerPid) || endedMilliseconds < claimedFloor
        : endedMilliseconds < unclaimedFloor
      if (expired) expiredIdentities.push(record.identity)
      else if (record.pending === true) pendingTokens += record.reservedTokens
      else missingIdentities.push(record.identity)
      continue
    }
    const uncachedInputTokens = record.inputTokens - (record.cachedInputTokens ?? 0)
    inputTokens += uncachedInputTokens
    outputTokens += record.outputTokens
    if (record.tier === "routine") routineTokens += uncachedInputTokens + record.outputTokens
    else reservedTokens += uncachedInputTokens + record.outputTokens
  }
  missingIdentities.sort()
  expiredIdentities.sort()
  return {
    engine,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    routineTokens,
    reservedTokens,
    pendingTokens,
    missingIdentities,
    expiredIdentities,
    windowStart: windowStart.toISOString(),
    resetsAt: resetAt.toISOString(),
  }
}

const emitJson = (result, json) => {
  if (json) console.log(JSON.stringify(result))
}

const parseBudgetRequest = (values, allowedFlags) => {
  rejectUnexpected(values, allowedFlags)
  const engine = parseEngine(requireValue(values, "--engine"))
  const identity = parseIdentity(requireValue(values, "--identity"))
  const tier = parseTier(requireValue(values, "--tier"))
  const resetAt = parseTimestamp(requireValue(values, "--reset-at"), "--reset-at")
  const warningTokens = parseTokenCount(requireValue(values, "--warning-tokens"), "--warning-tokens")
  const budgetTokens = parseTokenCount(requireValue(values, "--budget-tokens"), "--budget-tokens", 2, true)
  if (warningTokens >= budgetTokens) fail(`--warning-tokens must be below --budget-tokens`, 2)
  const invocationTokens = parseTokenCount(requireValue(values, "--invocation-tokens"), "--invocation-tokens")
  return { engine, identity, tier, resetAt, warningTokens, budgetTokens, invocationTokens }
}

const evaluateBudget = (request, records, json) => {
  const { engine, identity, tier, resetAt, warningTokens, budgetTokens, invocationTokens } = request
  const summary = summarize(records, engine, resetAt)
  const projectedTokens = summary.totalTokens + summary.pendingTokens + invocationTokens
  const status = projectedTokens > budgetTokens ? "BLOCK" : projectedTokens >= warningTokens ? "WARN" : "PROCEED"
  if (status === "BLOCK") {
    const result = { status, identity, tier, warningTokens, budgetTokens, invocationTokens, projectedTokens, ...summary }
    emitJson(result, json)
    fail(`invocation "${identity}" blocked: budget ${budgetTokens} tokens, observed spend ${summary.totalTokens} tokens, pending ${summary.pendingTokens} tokens, reservation ${invocationTokens} tokens, projected spend ${projectedTokens} tokens; resets at ${summary.resetsAt}`, 4)
  }
  if (summary.missingIdentities.length > 0) {
    emitJson({ status: "INCOMPLETE", identity, tier, warningTokens, budgetTokens, invocationTokens, ...summary }, json)
    fail(`cannot check invocation "${identity}": latest in-window records lack input or output tokens for identities ${summary.missingIdentities.join(", ")}`, 3)
  }
  const result = { status, identity, tier, warningTokens, budgetTokens, invocationTokens, projectedTokens, ...summary }
  return result
}

const emitBudgetResult = (result, json) => {
  emitJson(result, json)
  const { status, identity, warningTokens, budgetTokens, invocationTokens, projectedTokens, totalTokens, expiredIdentities } = result
  if (expiredIdentities.length > 0) {
    console.error(`automation-budget: reservation lease expired for identities ${expiredIdentities.join(", ")}; they hold no budget and no longer fail the fuse closed`)
  }
  if (status === "WARN") {
    console.error(`automation-budget: warning: invocation "${identity}" projects ${projectedTokens} tokens; warning ${warningTokens} tokens, budget ${budgetTokens} tokens, observed spend ${totalTokens} tokens`)
  }
}

const budgetFlags = new Set([
  "--engine",
  "--identity",
  "--tier",
  "--reset-at",
  "--warning-tokens",
  "--budget-tokens",
  "--invocation-tokens",
  "--ledger",
])

const appendRecord = (path, existingLedger, record) => {
  try {
    const separator = existingLedger.needsSeparator ? "\n" : ""
    appendFileSync(path, `${separator}${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 })
  } catch (error) {
    fail(`could not append ledger ${path}: ${error.message}`, 3)
  }
}

const runCheck = (values, json) => {
  const request = parseBudgetRequest(values, budgetFlags)
  const result = evaluateBudget(request, readLedger(ledgerPath(values)).records, json)
  emitBudgetResult(result, json)
}

const runReserve = (values, json) => {
  const request = parseBudgetRequest(values, new Set([
    ...budgetFlags,
    "--started-at",
    "--ended-at",
    "--account-used-percent",
    "--account-observed-at",
  ]))
  const startedAt = parseTimestamp(requireValue(values, "--started-at"), "--started-at")
  const endedAt = parseTimestamp(requireValue(values, "--ended-at"), "--ended-at")
  if (startedAt.getTime() > endedAt.getTime()) fail(`--started-at must not be after --ended-at`, 2)
  const pending = {
    identity: request.identity,
    engine: request.engine,
    tier: request.tier,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    pending: true,
    reservedTokens: request.invocationTokens,
  }
  const hasAccountPercent = values.has("--account-used-percent")
  const hasAccountTimestamp = values.has("--account-observed-at")
  if (hasAccountPercent !== hasAccountTimestamp) {
    fail(`--account-used-percent and --account-observed-at must be provided together`, 2)
  }
  if (hasAccountPercent) {
    pending.accountContext = {
      scope: "account",
      attributed: false,
      usedPercent: parsePercent(values.get("--account-used-percent"), "--account-used-percent"),
      observedAt: parseTimestamp(values.get("--account-observed-at"), "--account-observed-at").toISOString(),
    }
  }
  const path = ledgerPath(values)
  const result = withLedgerLock(path, () => {
    const existingLedger = readLedger(path)
    const evaluated = evaluateBudget(request, existingLedger.records, json)
    appendRecord(path, existingLedger, pending)
    return evaluated
  })
  emitBudgetResult({ ...result, reservation: pending }, json)
}

const runRecord = (values, json) => {
  rejectUnexpected(values, new Set([
    "--identity",
    "--engine",
    "--tier",
    "--started-at",
    "--ended-at",
    "--input-tokens",
    "--cached-input-tokens",
    "--output-tokens",
    "--provider-estimated-cost",
    "--account-used-percent",
    "--account-observed-at",
    "--ledger",
  ]))
  const startedAt = parseTimestamp(requireValue(values, "--started-at"), "--started-at")
  const endedAt = parseTimestamp(requireValue(values, "--ended-at"), "--ended-at")
  if (startedAt.getTime() > endedAt.getTime()) fail(`--started-at must not be after --ended-at`, 2)
  const record = {
    identity: parseIdentity(requireValue(values, "--identity")),
    engine: parseEngine(requireValue(values, "--engine")),
    tier: parseTier(requireValue(values, "--tier")),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  }
  if (values.has("--input-tokens")) {
    record.inputTokens = parseTokenCount(values.get("--input-tokens"), "--input-tokens")
  }
  if (values.has("--cached-input-tokens")) {
    record.cachedInputTokens = parseTokenCount(values.get("--cached-input-tokens"), "--cached-input-tokens")
    if (!hasOwn(record, "inputTokens") || record.cachedInputTokens > record.inputTokens) fail(`--cached-input-tokens requires --input-tokens and cannot exceed it`, 2)
  }
  if (values.has("--output-tokens")) {
    record.outputTokens = parseTokenCount(values.get("--output-tokens"), "--output-tokens")
  }
  if (values.has("--provider-estimated-cost")) {
    record.providerEstimatedCost = parseNonNegativeNumber(values.get("--provider-estimated-cost"), "--provider-estimated-cost")
  }
  const hasAccountPercent = values.has("--account-used-percent")
  const hasAccountTimestamp = values.has("--account-observed-at")
  if (hasAccountPercent !== hasAccountTimestamp) {
    fail(`--account-used-percent and --account-observed-at must be provided together`, 2)
  }
  if (hasAccountPercent) {
    record.accountContext = {
      scope: "account",
      attributed: false,
      usedPercent: parsePercent(values.get("--account-used-percent"), "--account-used-percent"),
      observedAt: parseTimestamp(values.get("--account-observed-at"), "--account-observed-at").toISOString(),
    }
  }
  const path = ledgerPath(values)
  withLedgerLock(path, () => {
    const existingLedger = readLedger(path)
    appendRecord(path, existingLedger, record)
  })
  emitJson({ status: "RECORDED", record }, json)
}

/**
 * The reservation is appended BEFORE the worktree exists, so the worker process it is paying
 * for does not exist yet and its PID cannot be on that row. `claim` appends the same pending
 * reservation again once the process is running, this time carrying its PID, and the
 * latest-in-window rule makes that the authoritative one. It re-evaluates nothing on purpose:
 * the budget was gated at `reserve`, and blocking here would refuse a worker already working.
 */
const runClaim = (values, json) => {
  rejectUnexpected(values, new Set([
    "--identity",
    "--engine",
    "--tier",
    "--started-at",
    "--ended-at",
    "--invocation-tokens",
    "--worker-pid",
    "--ledger",
  ]))
  const startedAt = parseTimestamp(requireValue(values, "--started-at"), "--started-at")
  const endedAt = parseTimestamp(requireValue(values, "--ended-at"), "--ended-at")
  if (startedAt.getTime() > endedAt.getTime()) fail(`--started-at must not be after --ended-at`, 2)
  const claimed = {
    identity: parseIdentity(requireValue(values, "--identity")),
    engine: parseEngine(requireValue(values, "--engine")),
    tier: parseTier(requireValue(values, "--tier")),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    pending: true,
    reservedTokens: parseTokenCount(requireValue(values, "--invocation-tokens"), "--invocation-tokens"),
    workerPid: parseTokenCount(requireValue(values, "--worker-pid"), "--worker-pid", 2, true),
  }
  const path = ledgerPath(values)
  withLedgerLock(path, () => {
    const existingLedger = readLedger(path)
    const latest = [...existingLedger.records].reverse().find((record) => record.identity === claimed.identity)
    if (!latest) fail(`cannot claim invocation "${claimed.identity}": no ledger record exists`, 3)
    if (latest.pending !== true) fail(`cannot claim invocation "${claimed.identity}": its latest record is not an open reservation`, 3)
    appendRecord(path, existingLedger, claimed)
  })
  emitJson({ status: "CLAIMED", record: claimed }, json)
}

const runCancel = (values, json) => {
  rejectUnexpected(values, new Set([
    "--identity",
    "--engine",
    "--tier",
    "--started-at",
    "--ended-at",
    "--ledger",
  ]))
  const identity = parseIdentity(requireValue(values, "--identity"))
  const engine = parseEngine(requireValue(values, "--engine"))
  const tier = parseTier(requireValue(values, "--tier"))
  const startedAt = parseTimestamp(requireValue(values, "--started-at"), "--started-at")
  const endedAt = parseTimestamp(requireValue(values, "--ended-at"), "--ended-at")
  if (startedAt.getTime() > endedAt.getTime()) fail(`--started-at must not be after --ended-at`, 2)
  const path = ledgerPath(values)
  const cancelled = withLedgerLock(path, () => {
    const existingLedger = readLedger(path)
    const latest = [...existingLedger.records].reverse().find((record) => record.identity === identity)
    if (!latest) fail(`cannot cancel invocation "${identity}": no ledger record exists`, 3)
    if (latest.engine !== engine || latest.tier !== tier || latest.startedAt !== startedAt.toISOString()) {
      fail(`cannot cancel invocation "${identity}": engine, tier, or start timestamp does not match its latest record`, 3)
    }
    if (latest.cancelled === true) return latest
    if (hasOwn(latest, "inputTokens") || hasOwn(latest, "outputTokens")) {
      fail(`cannot cancel invocation "${identity}": its latest record already carries a provider measurement`, 3)
    }
    const tombstone = {
      identity,
      engine,
      tier,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      cancelled: true,
    }
    appendRecord(path, existingLedger, tombstone)
    return tombstone
  })
  emitJson({ status: "CANCELLED", record: cancelled }, json)
}

const runReport = (values, json) => {
  rejectUnexpected(values, new Set(["--engine", "--reset-at", "--ledger"]))
  const engine = parseEngine(requireValue(values, "--engine"))
  const resetAt = parseTimestamp(requireValue(values, "--reset-at"), "--reset-at")
  const result = summarize(readLedger(ledgerPath(values)).records, engine, resetAt)
  if (json) console.log(JSON.stringify(result))
  else {
    const missing = result.missingIdentities.length > 0 ? result.missingIdentities.join(", ") : "none"
    const expired = result.expiredIdentities.length > 0 ? result.expiredIdentities.join(", ") : "none"
    console.log(`${result.engine}: ${result.totalTokens} tokens (${result.inputTokens} input, ${result.outputTokens} output; ${result.routineTokens} routine, ${result.reservedTokens} reserved, ${result.pendingTokens} pending); missing identities: ${missing}; expired reservations: ${expired}; resets at ${result.resetsAt}`)
  }
}

const options = parseArguments(process.argv.slice(2))
if (options.command === "check") runCheck(options.values, options.json)
else if (options.command === "reserve") runReserve(options.values, options.json)
else if (options.command === "record") runRecord(options.values, options.json)
else if (options.command === "claim") runClaim(options.values, options.json)
else if (options.command === "cancel") runCancel(options.values, options.json)
else runReport(options.values, options.json)
