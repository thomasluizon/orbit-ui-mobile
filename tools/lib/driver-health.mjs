/**
 * The health record of the delivery driver. Every tick, good or failed, writes `health.json` in the state directory, so a
 * check outside the driver sees a blind or stuck driver. All times are ISO strings or null.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const HEALTH_FILE = "health.json"
const DETAIL_LIMIT = 200
/** The end of the command in each message of `defaultRun` (`tools/lib/github.mjs`) and of the read of `tools/lib/github-read.mjs`. The cause follows the match. */
const COMMAND_END = /^(?:gh|GitHub read) [\s\S]*? (?:failed: |(?=timed out after \d+ms$)|(?=exceeded \d+ bytes of output$))/

/** The class of an error, from the first pattern that its message matches. A class never changes its name. */
const ERROR_CLASSES = [
  ["rate-limit", /rate.?limit|abuse detection/i],
  ["auth", /\b401\b|bad credentials|authentication|gh auth login|not logged in/i],
  ["network", /could not resolve|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|dial tcp|network is unreachable|error connecting to|check your internet connection/i],
  ["server", /\bHTTP 5\d\d\b|\b50[0-4]\b|bad gateway|service unavailable|gateway time-?out/i],
  ["timeout", /timed out|timeout|deadline exceeded|read ceiling/i],
]

/**
 * The cause in an error message of a `gh` call. `defaultRun` puts the whole command before the cause, and the command can hold a
 * whole query with each pull request number. A message of another shape is its own cause.
 */
const causeOf = (error) => {
  const text = String(error?.message ?? error)
  const command = COMMAND_END.exec(text)
  return command === null ? text : text.slice(command[0].length)
}

export const errorClassOf = (error) => {
  const cause = causeOf(error)
  return ERROR_CLASSES.find(([, pattern]) => pattern.test(cause))?.[0] ?? "other"
}

/** The cause of an error message, first line, cut. */
export const detailOf = (error) => causeOf(error).split("\n", 1)[0].slice(0, DETAIL_LIMIT)

/** The record of the last tick, or null before the first one. */
export const readHealth = (stateDir) => {
  try { return JSON.parse(readFileSync(join(stateDir, HEALTH_FILE), "utf8")) } catch { return null }
}

const iso = (milliseconds) => new Date(milliseconds).toISOString()

/**
 * The record of one tick.
 * - `read`: `{ openPulls, green }` when the read of the world succeeded, else null. `green` lists each open pull request that meets
 *   the bar at the end of the tick: `{ key, approvedAt }`. A merged one is not in it.
 * - `blind`: `[{ key, detail }]`, one for each read that failed, for example key `ui` or `tickets`.
 * - `failure`: `{ errorClass, detail, rateLimitedUntil }` when the tick met an error, else null.
 * A failed read keeps `openPulls`, `oldestGreenApprovedAt` and each `unmerged:` problem of the last good read.
 */
export const healthRecord = ({ previous, now, read, merged, blind, failure }) => {
  const since = (key, fallback) => previous?.problems?.find((problem) => problem.key === key)?.since ?? fallback
  const problems = [
    ...blind.map(({ key, detail }) => ({ key: `blind:${key}`, since: since(`blind:${key}`, iso(now)), detail })),
    ...(read === null ? (previous?.problems ?? []).filter((problem) => problem.key.startsWith("unmerged:")) : read.green.map(({ key, approvedAt }) => ({ key: `unmerged:${key}`, since: approvedAt, detail: "approved, meets the bar, not merged" }))),
    ...(failure !== null && blind.length === 0 ? [{ key: "error:tick", since: since("error:tick", iso(now)), detail: failure.detail }] : []),
  ]
  const oldest = read === null ? previous?.oldestGreenApprovedAt ?? null : read.green.map(({ approvedAt }) => approvedAt).sort().at(0) ?? null
  return {
    writtenAt: iso(now),
    lastGoodTickAt: read === null ? previous?.lastGoodTickAt ?? null : iso(now),
    lastMergeAt: merged ? iso(now) : previous?.lastMergeAt ?? null,
    openPulls: read === null ? previous?.openPulls ?? null : read.openPulls,
    oldestGreenApprovedAt: oldest,
    lastErrorClass: failure?.errorClass ?? null,
    rateLimitedUntil: failure?.rateLimitedUntil ?? null,
    problems,
  }
}

export const writeHealth = (stateDir, record) => writeFileSync(join(stateDir, HEALTH_FILE), `${JSON.stringify(record, null, 2)}\n`)

/**
 * The time that the exhausted limits of GitHub refill, in epoch milliseconds, or null when the read fails or no limit is empty.
 * `gh api rate_limit` costs no quota. Its `resources.<name>` hold `limit`, `remaining`, `reset` (epoch seconds) and `used`.
 * The driver reads through `core` and `graphql`, so only these two count. `onError` gets the error of a read that fails.
 */
export const rateLimitResetOf = async (gh, onError = () => {}) => {
  try {
    const { resources } = JSON.parse(await gh(["api", "rate_limit"]))
    const resets = ["core", "graphql"].map((name) => resources[name]).filter((entry) => entry.remaining === 0).map((entry) => entry.reset * 1000)
    return resets.length === 0 ? null : Math.max(...resets)
  } catch (error) {
    onError(error)
    return null
  }
}
