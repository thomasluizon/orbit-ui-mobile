/**
 * Reads a claude worker's stream-json log for the stop that ended it: a usage limit the account
 * cannot pass, or a sign-in the account cannot complete.
 */

import { closeSync, openSync, readSync, statSync } from "node:fs"

/**
 * The prefixes the installed claude CLI (2.1.319) classifies as a reached usage limit, copied from
 * its `var xAo=["You've hit your"` list and the pattern after it. The CLI tags such a subscriber 429
 * `apiError:"usage_limit_reached"`; a transient 429 does not match. The evidence and its locator
 * command live in `tools/__tests__/claude-usage-limit.mjs`.
 */
const LIMIT_PREFIXES = [
  "You've hit your",
  "You've reached your",
  "You're out of usage credits",
  "Your org is out of usage · add funds to continue",
  "Your org is out of usage · contact your admin",
  "Your seat type doesn't include usage credits",
  "Your seat type doesn't include usage",
  "Your usage allocation has been disabled by your admin",
  "Your group's usage limit is set to $0",
  "Fable 5 requires usage credits",
  "You're out of extra usage",
  "Your seat type doesn't include extra usage",
]
const LIMIT_PATTERNS = [/^(?:Fable|Haiku|Mythos|Opus|Sonnet)(?: [^·\n]{1,40})? requires usage credits\./]

export const isUsageLimitMessage = (text) =>
  typeof text === "string" && (LIMIT_PREFIXES.some((prefix) => text.startsWith(prefix)) || LIMIT_PATTERNS.some((pattern) => pattern.test(text)))

/** The verdict for a run that did not stop at a limit or at sign-in. */
export const NO_STOP = Object.freeze({ usageLimitReached: false, authenticationFailed: false, error: null })

/**
 * The verdict of the final `type: "result"` line, which carries `is_error: true` and the error text
 * in `result` when the last assistant message is an API error; `error` is that text. The CLI tags
 * that message `error: "authentication_failed"` for a missing sign-in and for a 401 or 403, such as
 * a revoked token, so `authenticationFailed` reads the tag before the result.
 */
export const finalResult = (logText) => {
  let verdict = NO_STOP
  let apiError = null
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record?.type === "assistant") apiError = record.is_api_error_message === true ? record.error ?? null : null
    if (record?.type !== "result") continue
    const failed = record.is_error === true
    verdict = {
      usageLimitReached: failed && isUsageLimitMessage(record.result),
      authenticationFailed: failed && apiError === "authentication_failed",
      error: failed && typeof record.result === "string" ? record.result : null,
    }
    apiError = null
  }
  return verdict
}

/** The result line is the last one the CLI writes, so only the tail of a long log is read. */
const TAIL_BYTES = 256 * 1024

export const logFinalResult = (logFile) => {
  let descriptor
  try {
    const size = statSync(logFile).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(logFile, "r")
    readSync(descriptor, buffer, 0, length, size - length)
    return finalResult(buffer.toString("utf8"))
  } catch {
    // A log that cannot be read proves no stop, and the launcher must still publish its result.
    return NO_STOP
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}
