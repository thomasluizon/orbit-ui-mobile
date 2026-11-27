import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { detailOf, errorClassOf, healthRecord, rateLimitResetOf, readHealth, writeHealth } from "../lib/driver-health.mjs"

import { T, root, same } from "./_harness.mjs"

const UNIT = "lib/driver-health.mjs"
const NOW = Date.parse("2026-11-19T12:00:00Z")
const MINUTE = 60 * 1000
const iso = (offset) => new Date(NOW + offset).toISOString()

export const cases = async () => {
  for (const [message, expected] of [
    ["gh api graphql failed: gh: API rate limit already exceeded for user ID 1. (HTTP 403)", "rate-limit"],
    ["gh api graphql returned errors: [{\"type\":\"RATE_LIMITED\"}]", "rate-limit"],
    ["gh api graphql failed: You have exceeded a secondary rate limit", "rate-limit"],
    ["gh api graphql failed: gh: Bad credentials (HTTP 401)", "auth"],
    ["gh api graphql failed: dial tcp: lookup api.github.com: no such host ECONNREFUSED", "network"],
    ["gh api graphql failed: gh: HTTP 502: Bad Gateway", "server"],
    ["gh api graphql failed: gh: HTTP 504: Gateway Timeout", "server"],
    ["gh api graphql timed out after 60000ms", "timeout"],
    ["GitHub read ceiling reached", "timeout"],
    ["gh api graphql returned errors: {}", "other"],
  ]) same(`${UNIT}: the class of "${message.slice(0, 60)}" is ${expected}`, errorClassOf(new Error(message)), expected)

  same(`${UNIT}: the detail is the text after the failed command, cut to its first line`, detailOf(new Error(`gh api graphql -f query=${"x".repeat(5000)} failed: gh: HTTP 502: Bad Gateway\nsecond line`)), "gh: HTTP 502: Bad Gateway")
  T(`${UNIT}: the detail never passes 200 characters`, detailOf(new Error("y".repeat(900))).length === 200)

  const green = [{ key: "ui#9", approvedAt: iso(-5 * MINUTE) }, { key: "api#4", approvedAt: iso(-50 * MINUTE) }]
  const good = healthRecord({ previous: null, now: NOW, read: { openPulls: 4, green }, merged: false, blind: [], failure: null })
  same(`${UNIT}: the oldest approval of the pull requests at the bar is oldestGreenApprovedAt`, [good.oldestGreenApprovedAt, good.problems.map((problem) => problem.key)], [iso(-50 * MINUTE), ["unmerged:ui#9", "unmerged:api#4"]])
  same(`${UNIT}: a tick with no pull request at the bar has no oldestGreenApprovedAt`, healthRecord({ previous: null, now: NOW, read: { openPulls: 0, green: [] }, merged: false, blind: [], failure: null }).oldestGreenApprovedAt, null)

  const thrown = healthRecord({ previous: null, now: NOW, read: { openPulls: 1, green: [] }, merged: false, blind: [], failure: { errorClass: "other", detail: "boom", rateLimitedUntil: null } })
  same(`${UNIT}: an error after a good read is the problem error:tick and keeps the read`, [thrown.lastGoodTickAt, thrown.lastErrorClass, thrown.problems], [iso(0), "other", [{ key: "error:tick", since: iso(0), detail: "boom" }]])
  const kept = healthRecord({ previous: thrown, now: NOW + 2 * MINUTE, read: { openPulls: 1, green: [] }, merged: false, blind: [], failure: { errorClass: "other", detail: "boom", rateLimitedUntil: null } })
  same(`${UNIT}: a problem keeps its first time while it lasts`, kept.problems[0].since, iso(0))
  const next = healthRecord({ previous: kept, now: NOW + 4 * MINUTE, read: { openPulls: 1, green: [] }, merged: false, blind: [], failure: null })
  same(`${UNIT}: a tick with no error clears the error class and the problem`, [next.lastErrorClass, next.problems], [null, []])

  const merged = healthRecord({ previous: { lastMergeAt: iso(-60 * MINUTE) }, now: NOW, read: { openPulls: 0, green: [] }, merged: true, blind: [], failure: null })
  const unmerged = healthRecord({ previous: { lastMergeAt: iso(-60 * MINUTE) }, now: NOW, read: { openPulls: 0, green: [] }, merged: false, blind: [], failure: null })
  same(`${UNIT}: a merge sets lastMergeAt and a tick without one keeps it`, [merged.lastMergeAt, unmerged.lastMergeAt], [iso(0), iso(-60 * MINUTE)])

  // The record that a failed read writes, then reads back from the disk.
  const directory = join(root, "driver-health-unit")
  mkdirSync(directory, { recursive: true })
  same(`${UNIT}: no file reads as null`, readHealth(directory), null)
  const failed = healthRecord({ previous: null, now: NOW, read: null, merged: false, blind: [{ key: "ui", detail: "gh: HTTP 502" }], failure: { errorClass: "server", detail: "gh: HTTP 502", rateLimitedUntil: null } })
  writeHealth(directory, failed)
  same(`${UNIT}: a failed read writes the record that the next read returns`, readHealth(directory), failed)
  T(`${UNIT}: the file ends with a new line`, readFileSync(join(directory, "health.json"), "utf8").endsWith("}\n"))
  same(`${UNIT}: a failed read lists blind:ui and has no good tick`, [failed.lastGoodTickAt, failed.lastErrorClass, failed.problems.map((problem) => problem.key)], [null, "server", ["blind:ui"]])

  const reset = Math.floor(NOW / 1000) + 600
  const resources = (core, graphql) => JSON.stringify({ resources: { core: { limit: 5000, remaining: core, reset: reset - 100, used: 5000 - core }, graphql: { limit: 5000, remaining: graphql, reset, used: 5000 - graphql }, search: { limit: 30, remaining: 0, reset: reset + 9999, used: 30 } } })
  same(`${UNIT}: the refill time is the latest reset of an empty core or graphql limit`, await rateLimitResetOf(async () => resources(0, 0)), reset * 1000)
  same(`${UNIT}: the refill time ignores a limit that the driver does not use`, await rateLimitResetOf(async () => resources(10, 10)), null)
  same(`${UNIT}: an unreadable rate_limit answer gives null`, [await rateLimitResetOf(async () => ""), await rateLimitResetOf(async () => { throw new Error("offline") })], [null, null])
}
