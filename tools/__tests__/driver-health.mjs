import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { detailOf, errorClassOf, healthRecord, rateLimitResetOf, readHealth, writeHealth } from "../lib/driver-health.mjs"

import { readRepositoryState } from "../lib/github.mjs"

import { T, orcaEnv, root, same } from "./_harness.mjs"

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
    ["gh api graphql -f query=query { x } failed: error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com", "network"],
    ["GitHub read api graphql -f query=query { x } failed: error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com", "network"],
    ["error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com", "network"],
    ["gh api graphql failed: gh: HTTP 502: Bad Gateway", "server"],
    ["gh api graphql failed: gh: HTTP 504: Gateway Timeout", "server"],
    ["GitHub read ceiling reached", "timeout"],
    ["gh api graphql returned errors: [{\"message\":\"API rate limit exceeded for user ID 1\"}]", "rate-limit"],
    ["gh api graphql returned errors: {}", "other"],
  ]) same(`${UNIT}: the class of "${message.slice(0, 60)}" is ${expected}`, errorClassOf(new Error(message)), expected)

  // The messages of `defaultRun`, from a real read: the command, with the whole query, comes before the cause. The query holds
  // each known pull request as `pullRequest(number: N)`, so N = 401 and N = 500 are the numbers that look like an HTTP status.
  const realMessage = async (stderr, knownNumbers) => {
    const saved = Object.fromEntries(["GH_BIN", "NODE_OPTIONS", "ORBIT_ORCA_STUB"].map((name) => [name, process.env[name]]))
    Object.assign(process.env, orcaEnv([{ match: "DriveState", stderr, exit: 1 }]))
    try {
      await readRepositoryState("ui", { knownNumbers })
    } catch (error) {
      return error.message
    } finally {
      for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
    }
    throw new Error("the stubbed read did not fail")
  }
  // The offline stderr of gh: the installed gh 2.101.0 binary holds the format "error connecting to %s" and the line
  // "check your internet connection or https://githubstatus.com". The host is api.github.com.
  const offline = await realMessage("error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com", [30])
  same(`${UNIT}: a read that fails with the gh offline stderr has the class network and names the host`, [errorClassOf(new Error(offline)), detailOf(new Error(offline))], ["network", "error connecting to api.github.com"])
  // The stderr of a real `gh api graphql` run (gh 2.101.0) for a repository that does not exist. The stdout holds the JSON with
  // `"type":"NOT_FOUND"`, and the stderr holds this line. It is a missing repository, not a network error.
  const notFoundStderr = "gh: Could not resolve to a Repository with the name 'thomasluizon/orbit-no-such-repository-0'."
  const notFound = await realMessage(notFoundStderr, [30])
  same(`${UNIT}: a read that fails with the real gh NOT_FOUND stderr has the class other and names the repository`, [errorClassOf(new Error(notFound)), detailOf(new Error(notFound))], ["other", notFoundStderr])
  same(`${UNIT}: the NOT_FOUND text alone has the class other`, errorClassOf(new Error(notFoundStderr)), "other")
  same(`${UNIT}: a NOT_FOUND text after a command with a pull request number has the class other`, errorClassOf(new Error(`gh api graphql -f query=query { pullRequest(number: 503) { id } } failed: ${notFoundStderr}`)), "other")
  for (const number of [401, 500, 502, 503, 504]) {
    const failed = await realMessage("error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com", [number])
    same(`${UNIT}: a failed read with pull request #${number} in its query has the class network`, [errorClassOf(new Error(failed)), detailOf(new Error(failed))], ["network", "error connecting to api.github.com"])
    const command = failed.slice(0, failed.indexOf(" failed: "))
    same(`${UNIT}: a timed out read with pull request #${number} in its query has the class timeout and names the timeout`, [errorClassOf(new Error(`${command} timed out after 30000ms`)), detailOf(new Error(`${command} timed out after 30000ms`))], ["timeout", "timed out after 30000ms"])
    same(`${UNIT}: an overflowed read with pull request #${number} in its query has the class other and names the overflow`, [errorClassOf(new Error(`${command} exceeded 33554432 bytes of output`)), detailOf(new Error(`${command} exceeded 33554432 bytes of output`))], ["other", "exceeded 33554432 bytes of output"])
  }
  same(`${UNIT}: the cause after a failed command keeps a later failed: of its own text`, detailOf(new Error("gh api graphql -f query=query { x } failed: gh: step failed: HTTP 502")), "gh: step failed: HTTP 502")

  same(`${UNIT}: the detail is the text after the failed command, cut to its first line`, detailOf(new Error(`gh api graphql -f query=${"x".repeat(5000)} failed: gh: HTTP 502: Bad Gateway\nsecond line`)), "gh: HTTP 502: Bad Gateway")
  T(`${UNIT}: the detail never passes 200 characters`, detailOf(new Error("y".repeat(900))).length === 200)

  const green = [{ key: "ui#9", approvedAt: iso(-5 * MINUTE) }, { key: "api#4", approvedAt: iso(-50 * MINUTE) }]
  const good = healthRecord({ previous: null, now: NOW, read: { openPulls: 4, green }, merged: false, blind: [], failure: null })
  same(`${UNIT}: the oldest approval of the pull requests at the bar is oldestGreenApprovedAt`, [good.oldestGreenApprovedAt, good.problems.map((problem) => problem.key)], [iso(-50 * MINUTE), ["unmerged:ui#9", "unmerged:api#4"]])
  same(`${UNIT}: a good read writes its time, its open count and one unmerged problem with the approval time for each pull request at the bar`, [good.writtenAt, good.lastGoodTickAt, good.openPulls, good.problems], [iso(0), iso(0), 4, green.map(({ key, approvedAt }) => ({ key: `unmerged:${key}`, since: approvedAt, detail: "approved, meets the bar, not merged" }))])
  const blindFailure = { errorClass: "server", detail: "gh: HTTP 502", rateLimitedUntil: null }
  const blindTick = healthRecord({ previous: good, now: NOW + 2 * MINUTE, read: null, merged: false, blind: [{ key: "ui", detail: "gh: HTTP 502" }], failure: blindFailure })
  same(`${UNIT}: a failed read keeps openPulls, oldestGreenApprovedAt, lastGoodTickAt and each unmerged: problem of the last good read`, [blindTick.openPulls, blindTick.oldestGreenApprovedAt, blindTick.lastGoodTickAt, blindTick.problems.map((problem) => problem.key)], [4, iso(-50 * MINUTE), iso(0), ["blind:ui", "unmerged:ui#9", "unmerged:api#4"]])
  same(`${UNIT}: a failed read keeps the approval time and the detail of each unmerged: problem and names the blind read`, blindTick.problems, [{ key: "blind:ui", since: iso(2 * MINUTE), detail: "gh: HTTP 502" }, ...good.problems])
  const blindAgain = healthRecord({ previous: blindTick, now: NOW + 4 * MINUTE, read: null, merged: false, blind: [{ key: "ui", detail: "gh: HTTP 504" }], failure: blindFailure })
  same(`${UNIT}: a blind problem keeps its first time and takes the detail of the last failure`, [blindAgain.problems[0], blindAgain.problems.slice(1)], [{ key: "blind:ui", since: iso(2 * MINUTE), detail: "gh: HTTP 504" }, good.problems])
  const recovered = healthRecord({ previous: blindAgain, now: NOW + 6 * MINUTE, read: { openPulls: 3, green: [] }, merged: false, blind: [], failure: null })
  same(`${UNIT}: a good read after a failed read clears the blind problem and each unmerged: problem and takes the new counts`, [recovered.openPulls, recovered.oldestGreenApprovedAt, recovered.lastGoodTickAt, recovered.problems], [3, null, iso(6 * MINUTE), []])
  const limited = healthRecord({ previous: null, now: NOW, read: null, merged: false, blind: [{ key: "ui", detail: "gh: HTTP 403" }], failure: { errorClass: "rate-limit", detail: "gh: HTTP 403", rateLimitedUntil: iso(10 * MINUTE) } })
  same(`${UNIT}: a rate limit failure writes rateLimitedUntil and the class, and a tick without one clears them`, [limited.lastErrorClass, limited.rateLimitedUntil, healthRecord({ previous: limited, now: NOW + MINUTE, read: { openPulls: 0, green: [] }, merged: false, blind: [], failure: null }).rateLimitedUntil], ["rate-limit", iso(10 * MINUTE), null])
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
