/**
 * The pin of the delivery driver: the commit that its own worktree holds, the record of each run and the crashes of the new
 * version after a switch. All state is a file beside the pid files, so a restart loses nothing.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PIN_FILE = "pin.json"
const RUN_FILE = "run.json"
const CRASH_FILE = "crashes.json"
const DAY_MS = 24 * 60 * 60 * 1000

const ROLLBACK_WINDOW_MS = 10 * 60 * 1000
const ROLLBACK_CRASHES = 3

const DRIVER_FILES = [/^tools\/drive\.mjs$/, /^tools\/lib\//, /^tools\/__fixtures__\/drive-/]

/** True when one of the changed paths belongs to the driver. */
export const changesDriver = (files) => files.some((file) => DRIVER_FILES.some((pattern) => pattern.test(file)))

const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, "utf8")) } catch { return fallback }
}

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`)

/** The last line of a message that has text, cut to 300 characters. */
export const lastLine = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean).at(-1)?.slice(0, 300) ?? ""

/** The last switch or rollback: `{ from, to, at, rolledBack }`, or null before the first one. */
export const readPin = (stateDir) => readJson(join(stateDir, PIN_FILE), null)

export const writePin = (stateDir, pin) => writeJson(join(stateDir, PIN_FILE), pin)

/** Starts the record of a run: the commit it runs and a null exit code until the run ends. */
export const startRun = (stateDir, { sha, pid, now }) => writeJson(join(stateDir, RUN_FILE), { sha, pid, startedAt: new Date(now).toISOString(), endedAt: null, exitCode: null, error: null })

/** Ends the record of the run that `startRun` wrote. */
export const endRun = (stateDir, { exitCode, error, now }) => {
  const run = readJson(join(stateDir, RUN_FILE), null)
  if (run !== null) writeJson(join(stateDir, RUN_FILE), { ...run, endedAt: new Date(now).toISOString(), exitCode, error: error ?? null })
}

/**
 * Moves the previous run into the crash list when it did not end with exit code 0, and returns the crashes of the last day.
 * A run that never wrote an exit code died with a signal or a thrown error that no handler saw. The record of the previous
 * run is consumed, so a crash counts once.
 */
export const collectCrash = (stateDir, now) => {
  const previous = readJson(join(stateDir, RUN_FILE), null)
  const crashes = readJson(join(stateDir, CRASH_FILE), []).filter((crash) => now - Date.parse(crash.at) < DAY_MS)
  if (previous !== null && previous.exitCode !== 0) {
    crashes.push({ sha: previous.sha, at: previous.endedAt ?? previous.startedAt, error: previous.error || `exit code ${previous.exitCode ?? "none"}` })
  }
  writeJson(join(stateDir, CRASH_FILE), crashes)
  rmSync(join(stateDir, RUN_FILE), { force: true })
  return crashes
}

/**
 * The crashes that call for a rollback: the new version of the pin crashed `ROLLBACK_CRASHES` times, each within
 * `ROLLBACK_WINDOW_MS` of the switch. Returns the crashes, or an empty list when the pin needs no rollback.
 */
export const crashesOfSwitch = ({ pin, head, crashes }) => {
  if (pin === null || pin.rolledBack || pin.to !== head) return []
  const switchedAt = Date.parse(pin.at)
  const own = crashes.filter((crash) => crash.sha === head && Date.parse(crash.at) >= switchedAt && Date.parse(crash.at) - switchedAt <= ROLLBACK_WINDOW_MS)
  return own.length >= ROLLBACK_CRASHES ? own : []
}

/** True when `sha` is the commit that the last rollback left, so the driver never switches to it again. */
export const rolledBackFrom = (pin, sha) => pin?.rolledBack === true && pin.from === sha
