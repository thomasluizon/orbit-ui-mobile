#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

const WARNING_PERCENT = 20
const BLOCK_PERCENT = 25
const WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1000
const ENGINES = new Set(["claude", "codex"])
const TIERS = new Set(["routine", "reserved"])
const DEFAULT_LEDGER_PATH = resolve(homedir(), ".orbit", "automation-budget.jsonl")
const USAGE = `usage:
  automation-budget.mjs check --engine <claude|codex> --tier <routine|reserved> --reset-at <timestamp> [--ledger <path>] [--json]
  automation-budget.mjs record --identity <id> --engine <claude|codex> --tier <routine|reserved> --started-at <timestamp> --ended-at <timestamp> --measured-cost <percent> [--ledger <path>] [--json]
  automation-budget.mjs report --engine <claude|codex> --reset-at <timestamp> [--ledger <path>] [--json]

  check          apply the current engine's weekly fuse before an invocation
  record         append one completed invocation to the ledger
  report         print one engine's current seven-day ledger totals and reset time
  --identity     stable identity for the invocation
  --engine       quota pool charged by the invocation; engines are never combined
  --tier         routine automation or explicitly reserved deep work
  --started-at   invocation start as ISO-8601 with a timezone, or Unix seconds
  --ended-at     invocation end as ISO-8601 with a timezone, or Unix seconds
  --measured-cost
                  measured percentage points charged to this engine, from 0 to 100
  --reset-at     end of the current weekly window as ISO-8601 with a timezone, or Unix seconds
  --ledger       JSONL ledger path; defaults to ORBIT_AUTOMATION_BUDGET_LEDGER or ${DEFAULT_LEDGER_PATH}
  --json         emit the command result as JSON; without it check and record are quiet on success
  --help, -h     print this usage and exit 0

The fuse warns for routine automation at ${WARNING_PERCENT} percent and blocks it at ${BLOCK_PERCENT} percent.
Explicitly reserved deep work is permitted at every routine-automation usage level.
Records are attributed to the seven-day window containing their end timestamp.

exit codes:
  0  success or permitted invocation
  2  invalid command-line input
  3  ledger read, validation, or append failure
  4  routine automation blocked by the ${BLOCK_PERCENT} percent fuse`

const fail = (message, code) => {
  console.error(`automation-budget: ${message}`)
  process.exit(code)
}

const parseArguments = (argumentsList) => {
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
    console.log(USAGE)
    process.exit(0)
  }
  const command = argumentsList[0]
  if (!["check", "record", "report"].includes(command)) fail(`expected check, record, or report\n\n${USAGE}`, 2)
  const values = new Map()
  const switches = new Set()
  for (let index = 1; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === "--json") {
      if (switches.has(argument)) fail(`duplicate argument ${argument}`, 2)
      switches.add(argument)
      continue
    }
    if (!["--identity", "--engine", "--tier", "--started-at", "--ended-at", "--measured-cost", "--reset-at", "--ledger"].includes(argument)) {
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

const parseCost = (value, flag = "--measured-cost", failureCode = 2) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value))) fail(`${flag} must be a number from 0 to 100`, failureCode)
  const cost = Number(value)
  if (!Number.isFinite(cost) || cost < 0 || cost > 100) fail(`${flag} must be a number from 0 to 100`, failureCode)
  return cost
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

const validateRecord = (record, lineNumber) => {
  const prefix = `ledger line ${lineNumber}`
  if (record === null || Array.isArray(record) || typeof record !== "object") fail(`${prefix} must be a JSON object`, 3)
  const identity = parseIdentity(record.identity, 3, `${prefix} identity`)
  if (!ENGINES.has(record.engine)) fail(`${prefix} has an invalid engine`, 3)
  if (!TIERS.has(record.tier)) fail(`${prefix} has an invalid tier`, 3)
  const startedAt = parseTimestamp(record.startedAt, `${prefix} startedAt`, 3)
  const endedAt = parseTimestamp(record.endedAt, `${prefix} endedAt`, 3)
  const measuredCost = parseCost(record.measuredCost, `${prefix} measuredCost`, 3)
  if (startedAt.getTime() > endedAt.getTime()) fail(`${prefix} starts after it ends`, 3)
  return {
    identity,
    engine: record.engine,
    tier: record.tier,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    measuredCost,
  }
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

const rounded = (value) => Number(value.toFixed(6))

const summarize = (records, engine, resetAt) => {
  const resetMilliseconds = resetAt.getTime()
  const windowStart = new Date(resetMilliseconds - WINDOW_MILLISECONDS)
  let routinePercent = 0
  let reservedPercent = 0
  for (const record of records) {
    const endedMilliseconds = Date.parse(record.endedAt)
    if (record.engine !== engine || endedMilliseconds < windowStart.getTime() || endedMilliseconds >= resetMilliseconds) continue
    if (record.tier === "routine") routinePercent += record.measuredCost
    else reservedPercent += record.measuredCost
  }
  return {
    engine,
    weeklyPercent: rounded(routinePercent + reservedPercent),
    routinePercent: rounded(routinePercent),
    reservedPercent: rounded(reservedPercent),
    windowStart: windowStart.toISOString(),
    resetsAt: resetAt.toISOString(),
  }
}

const emitJson = (result, json) => {
  if (json) console.log(JSON.stringify(result))
}

const runCheck = (values, json) => {
  rejectUnexpected(values, new Set(["--engine", "--tier", "--reset-at", "--ledger"]))
  const engine = parseEngine(requireValue(values, "--engine"))
  const tier = parseTier(requireValue(values, "--tier"))
  const resetAt = parseTimestamp(requireValue(values, "--reset-at"), "--reset-at")
  const summary = summarize(readLedger(ledgerPath(values)).records, engine, resetAt)
  const status = tier === "routine" && summary.weeklyPercent >= BLOCK_PERCENT
    ? "BLOCK"
    : tier === "routine" && summary.weeklyPercent >= WARNING_PERCENT
      ? "WARN"
      : "PROCEED"
  const result = { status, tier, ...summary, warningPercent: WARNING_PERCENT, blockPercent: BLOCK_PERCENT }
  emitJson(result, json)
  if (status === "BLOCK") {
    fail(`routine ${engine} automation blocked at ${summary.weeklyPercent} percent; threshold ${BLOCK_PERCENT} percent; resets at ${summary.resetsAt}`, 4)
  }
  if (status === "WARN") {
    console.error(`automation-budget: warning: routine ${engine} automation is at ${summary.weeklyPercent} percent; warning threshold ${WARNING_PERCENT} percent; block threshold ${BLOCK_PERCENT} percent; resets at ${summary.resetsAt}`)
  }
}

const runRecord = (values, json) => {
  rejectUnexpected(values, new Set(["--identity", "--engine", "--tier", "--started-at", "--ended-at", "--measured-cost", "--ledger"]))
  const startedAt = parseTimestamp(requireValue(values, "--started-at"), "--started-at")
  const endedAt = parseTimestamp(requireValue(values, "--ended-at"), "--ended-at")
  if (startedAt.getTime() > endedAt.getTime()) fail(`--started-at must not be after --ended-at`, 2)
  const record = {
    identity: parseIdentity(requireValue(values, "--identity")),
    engine: parseEngine(requireValue(values, "--engine")),
    tier: parseTier(requireValue(values, "--tier")),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    measuredCost: parseCost(requireValue(values, "--measured-cost")),
  }
  const path = ledgerPath(values)
  const existingLedger = readLedger(path)
  try {
    mkdirSync(dirname(path), { recursive: true })
    const separator = existingLedger.needsSeparator ? "\n" : ""
    appendFileSync(path, `${separator}${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 })
  } catch (error) {
    fail(`could not append ledger ${path}: ${error.message}`, 3)
  }
  emitJson({ status: "RECORDED", record }, json)
}

const runReport = (values, json) => {
  rejectUnexpected(values, new Set(["--engine", "--reset-at", "--ledger"]))
  const engine = parseEngine(requireValue(values, "--engine"))
  const resetAt = parseTimestamp(requireValue(values, "--reset-at"), "--reset-at")
  const result = summarize(readLedger(ledgerPath(values)).records, engine, resetAt)
  if (json) console.log(JSON.stringify(result))
  else {
    console.log(`${result.engine}: ${result.weeklyPercent} percent (${result.routinePercent} routine, ${result.reservedPercent} reserved); resets at ${result.resetsAt}`)
  }
}

const options = parseArguments(process.argv.slice(2))
if (options.command === "check") runCheck(options.values, options.json)
else if (options.command === "record") runRecord(options.values, options.json)
else runReport(options.values, options.json)
