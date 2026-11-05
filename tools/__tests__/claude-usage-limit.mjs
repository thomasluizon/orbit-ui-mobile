import { isUsageLimitMessage, logReachedUsageLimit, reachedUsageLimit } from "../lib/claude-usage-limit.mjs"

import { T, stage } from "./_harness.mjs"

const UNIT = "lib/claude-usage-limit.mjs"

/**
 * Shapes copied from the installed claude CLI (2.1.318): its stream-json `result` record carries
 * type, subtype, is_error, result and api_error_status, and its subscriber limit text is
 * `You've hit your ${limitName}${suffix}` with limit names such as "5-hour limit".
 */
export const resultLine = (text, isError = true) => JSON.stringify({
  type: "result", subtype: "success", is_error: isError, duration_ms: 0, duration_api_ms: 0, num_turns: 1,
  result: text, stop_reason: null, session_id: "fixture-session", ...(isError ? { api_error_status: 429 } : {}),
})
export const LIMIT_TEXT = "You've hit your 5-hour limit · resets 3pm"
const TRANSIENT_TEXT = "API Error: Server is temporarily limiting requests (not your usage limit) · Rate limited"
const assistantLine = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "working" }] } })

export const cases = () => {
  T(`${UNIT}: the subscriber 5-hour limit text is a usage limit`, isUsageLimitMessage(LIMIT_TEXT))
  T(`${UNIT}: the weekly limit text is a usage limit`, isUsageLimitMessage("You've hit your weekly limit · resets Nov 9"))
  T(`${UNIT}: a model that requires usage credits is a usage limit`, isUsageLimitMessage("Opus requires usage credits. /model to switch models."))
  T(`${UNIT}: the transient server 429 is not a usage limit`, !isUsageLimitMessage(TRANSIENT_TEXT))
  T(`${UNIT}: an overload notice is not a usage limit`, !isUsageLimitMessage("Opus is experiencing high load. Switch to Sonnet."))
  T(`${UNIT}: a non-string is not a usage limit`, !isUsageLimitMessage(undefined))

  T(`${UNIT}: a final error result with the limit text reached the limit`, reachedUsageLimit([assistantLine, resultLine(LIMIT_TEXT)].join("\n")))
  T(`${UNIT}: a final error result with any other text did not`, !reachedUsageLimit([assistantLine, resultLine(TRANSIENT_TEXT)].join("\n")))
  T(`${UNIT}: a successful result that quotes the limit text did not`, !reachedUsageLimit(resultLine(LIMIT_TEXT, false)))
  T(`${UNIT}: the limit text inside an assistant message alone did not`,
    !reachedUsageLimit(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: LIMIT_TEXT }] } })))
  T(`${UNIT}: a later successful result replaces an earlier limit result`, !reachedUsageLimit([resultLine(LIMIT_TEXT), resultLine("done", false)].join("\n")))
  T(`${UNIT}: a log with no result line did not`, !reachedUsageLimit(`${assistantLine}\nnot json\n`))

  const long = stage("claude-usage-limit/long.log", `${"x".repeat(400 * 1024)}\n${assistantLine}\n${resultLine(LIMIT_TEXT)}\n`)
  T(`${UNIT}: the tail of a log longer than the read window still shows the limit`, logReachedUsageLimit(long))
  T(`${UNIT}: an absent log did not reach the limit`, !logReachedUsageLimit(`${long}.absent`))
}
