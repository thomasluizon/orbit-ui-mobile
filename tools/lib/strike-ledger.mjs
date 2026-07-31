/**
 * The durable counter behind worker-contract clause 4, "two consecutive cycles fail on the same
 * finding. Do not try that finding a third time."
 *
 * That clause was a STRING in the contract the launcher injects, asserted only by a regex over
 * the clause text. Every relaunch is a fresh process reading a fresh prompt file, so the count it
 * describes reset to zero each time and the escalation degraded into unbounded retry. That is
 * what nineteen review rounds looks like. An audit of every writeFileSync and appendFileSync in
 * tools/*.mjs found no per-(issue, finding) state anywhere, so there was nothing to read either.
 *
 * This is NOT the `attempts:N` Linear label that wave-plan.mjs reads against
 * attemptsBeforeRewrite. That one counts whole ticket attempts before the ticket gets rewritten;
 * this one counts cycles spent on ONE finding before the worker escalates. Merging them would
 * make each one wrong about the other's population.
 *
 * The store is append-only JSONL keyed by (scope, issue, key), so a second counter can live
 * beside the first without either guessing about the other: the section E relaunch cap keys
 * `{ scope: "relaunch", issue, key: <head SHA> }` while clause 4 keys
 * `{ scope: "finding", issue, key: <finding id> }`. Counting is a filter over the file, so a
 * consumer never has to know which other scopes exist. Isolation is the single env override,
 * exactly as ORBIT_AUTOMATION_BUDGET_LEDGER isolates the budget ledger; a second mechanism would
 * be one more thing a test can forget to set.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

export const STRIKE_LEDGER_ENV = "ORBIT_WORKER_STRIKE_LEDGER"

/** Clause 4's own number: the third cycle on one finding escalates instead of retrying. */
export const STRIKES_BEFORE_ESCALATION = 2

export const FINDING_SCOPE = "finding"
export const RELAUNCH_SCOPE = "relaunch"

export const strikeLedgerPath = (override = process.env[STRIKE_LEDGER_ENV]) => {
  if (override !== undefined && override.trim().length === 0) {
    throw new Error(`${STRIKE_LEDGER_ENV} must not be empty`)
  }
  return resolve(override ?? resolve(homedir(), ".orbit", "worker-strikes.jsonl"))
}

const readEntries = (ledgerPath) => {
  let raw
  try {
    raw = readFileSync(ledgerPath, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw new Error(`could not read the strike ledger ${ledgerPath}: ${error.message}`)
  }
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`strike ledger ${ledgerPath} line ${index + 1} is not JSON: ${error.message}`)
      }
    })
}

/** How many cycles this (scope, issue, key) has already burned. */
export const strikeCount = ({ ledgerPath, scope, issue, key }) =>
  readEntries(ledgerPath).filter(
    (entry) => entry.scope === scope && entry.issue === issue && entry.key === key,
  ).length

/** Records one cycle and returns the count INCLUDING it, so a caller never re-reads to decide. */
export const recordStrike = ({ ledgerPath, scope, issue, key }) => {
  const before = strikeCount({ ledgerPath, scope, issue, key })
  try {
    mkdirSync(dirname(ledgerPath), { recursive: true })
    appendFileSync(
      ledgerPath,
      `${JSON.stringify({ scope, issue, key, recordedAt: new Date().toISOString() })}\n`,
      { encoding: "utf8", mode: 0o600 },
    )
  } catch (error) {
    throw new Error(`could not append the strike ledger ${ledgerPath}: ${error.message}`)
  }
  return before + 1
}
