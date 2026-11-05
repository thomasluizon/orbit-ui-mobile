/** Reads a claude worker's stream-json log for the usage-limit stop that the account cannot pass. */

import { closeSync, openSync, readSync, statSync } from "node:fs"

/**
 * The message prefixes the installed claude CLI (2.1.318) itself classifies as a reached usage
 * limit, copied from its source. A subscriber 429 with rate-limit headers becomes a message that
 * starts with one of these, and the CLI tags that message `usage_limit_reached`. A transient 429
 * ("Server is temporarily limiting requests (not your usage limit)") and an overload notice do not.
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

/**
 * True when the log's final `result` record is an error whose text is a usage-limit message. In
 * `-p --output-format stream-json`, the CLI ends a run with one `type: "result"` line; on an API
 * error it carries `is_error: true` and the error text in `result`.
 */
export const reachedUsageLimit = (logText) => {
  let verdict = false
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record?.type === "result") verdict = record.is_error === true && isUsageLimitMessage(record.result)
  }
  return verdict
}

/** The result line is the last one the CLI writes, so only the tail of a long log is read. */
const TAIL_BYTES = 256 * 1024

export const logReachedUsageLimit = (logFile) => {
  let descriptor
  try {
    const size = statSync(logFile).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(logFile, "r")
    readSync(descriptor, buffer, 0, length, size - length)
    return reachedUsageLimit(buffer.toString("utf8"))
  } catch {
    // A log that cannot be read proves no limit, and the launcher must still publish its result.
    return false
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}
