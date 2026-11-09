import { finalResult, isUsageLimitMessage, logFinalResult } from "../lib/claude-usage-limit.mjs"

import { T, stage } from "./_harness.mjs"

const UNIT = "lib/claude-usage-limit.mjs"

/**
 * Strings located in the installed claude CLI, the binary at `readlink "$(command -v claude)"`.
 * Re-derive each one with `grep -a -b -o -F '<literal>' <binary>`. The result builder sets
 * `is_error`, `result` and `api_error` from the last assistant message when it is an API error.
 */
const CLI_EVIDENCE = {
  version: "2.1.319 (Claude Code)",
  resultBuilder: 'variant:{subtype:"success",api_error_status:',
  limitPrefixes: `var xAo=["You've hit your"`,
  limitTag: 'apiError:"usage_limit_reached"',
  limitTemplate: "return`You've hit your ${e}${i}${s}`",
  limitNames: 'Rye={five_hour:"5-hour limit"',
  transientText: 'vor="Server is temporarily limiting requests (not your usage limit)"',
  transientTemplate: "content:`${hd}: ${He} \\xB7 ${xe||Ne}`,error:\"rate_limit\"",
  authenticationTag: 'Ys({error:"authentication_failed"',
  apiErrorMarker: "{is_api_error_message:!0",
}
const quoted = (literal) => literal.slice(literal.indexOf('"') + 1, literal.lastIndexOf('"'))

/** The key set a real `claude -p "reply with ok" --output-format stream-json --verbose --max-turns 1` run wrote. */
export const resultLine = (text, { isError = true, apiError } = {}) => JSON.stringify({
  type: "result", subtype: "success", is_error: isError, duration_ms: 0, duration_api_ms: 0, ttft_ms: 0, ttft_stream_ms: 0,
  time_to_request_ms: 0, first_content_frame_ms: 0, num_turns: 1, result: text, stop_reason: null,
  terminal_reason: "completed", session_id: "fixture-session", total_cost_usd: 0, usage: {}, modelUsage: {},
  model_usage_since_last_result: {}, subagent_stats: {}, safety_stops: 0, permission_denials: [], queued_turn_count: 0,
  result_index: 0, fast_mode_state: "off", fast_mode_disabled_reason: "sdk_opt_in_required", credential_expires_at: "1970-01-01T00:00:00.000Z",
  uuid: "fixture-uuid", api_error_status: isError ? 429 : null, ...(apiError === undefined ? {} : { api_error: apiError }),
})
export const LIMIT_TEXT = `You've hit your ${quoted(CLI_EVIDENCE.limitNames)} · resets 3pm`
export const limitResultLine = () => resultLine(LIMIT_TEXT, { apiError: quoted(CLI_EVIDENCE.limitTag) })
export const TRANSIENT_TEXT = `API Error: ${quoted(CLI_EVIDENCE.transientText)} · this may be a temporary capacity issue.`
const assistantLine = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "working" }] } })
/**
 * The two final lines a real run wrote with `CLAUDE_CONFIG_DIR` set to an empty directory and every
 * inherited credential removed: the CLI's API error message, tagged with its error kind, then the
 * result. A revoked token takes the same tag through the CLI's 401 and 403 branch.
 */
export const SIGN_IN_TEXT = "Not logged in · Please run /login"
const apiErrorLine = (text, error) => JSON.stringify({
  type: "assistant", message: { model: "<synthetic>", role: "assistant", content: [{ type: "text", text }] },
  parent_tool_use_id: null, session_id: "fixture-session", error, is_api_error_message: true,
})
export const signInFailureLines = () => [apiErrorLine(SIGN_IN_TEXT, quoted(CLI_EVIDENCE.authenticationTag)), resultLine(SIGN_IN_TEXT).replace('"api_error_status":429', '"api_error_status":null')].join("\n")
const NO_STOP = { usageLimitReached: false, authenticationFailed: false, error: null }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export const cases = () => {
  T(`${UNIT}: the first prefix the CLI ${CLI_EVIDENCE.version} lists is a usage limit`, isUsageLimitMessage(quoted(CLI_EVIDENCE.limitPrefixes)))
  T(`${UNIT}: the subscriber 5-hour limit text is a usage limit`, isUsageLimitMessage(LIMIT_TEXT))
  T(`${UNIT}: the weekly limit text is a usage limit`, isUsageLimitMessage("You've hit your weekly limit · resets Nov 9"))
  T(`${UNIT}: a model that requires usage credits is a usage limit`, isUsageLimitMessage("Opus requires usage credits. /model to switch models."))
  T(`${UNIT}: the transient server 429 is not a usage limit`, !isUsageLimitMessage(TRANSIENT_TEXT))
  T(`${UNIT}: an overload notice is not a usage limit`, !isUsageLimitMessage("Opus is experiencing high load. Switch to Sonnet."))
  T(`${UNIT}: a non-string is not a usage limit`, !isUsageLimitMessage(undefined))

  const limit = finalResult([assistantLine, limitResultLine()].join("\n"))
  T(`${UNIT}: a final error result with the limit text reached the limit`,
    same(limit, { usageLimitReached: true, authenticationFailed: false, error: LIMIT_TEXT }), JSON.stringify(limit))
  const transient = finalResult([assistantLine, resultLine(TRANSIENT_TEXT)].join("\n"))
  T(`${UNIT}: a transient 429 result does not reach the account limit and keeps its text`,
    same(transient, { usageLimitReached: false, authenticationFailed: false, error: TRANSIENT_TEXT }), JSON.stringify(transient))
  T(`${UNIT}: a model that needs usage credits reached the limit`,
    finalResult(resultLine("Opus requires usage credits. /model to switch models.", { apiError: "model_requires_usage_credits" })).usageLimitReached)
  T(`${UNIT}: a successful result that quotes the limit text did not`, same(finalResult(resultLine(LIMIT_TEXT, { isError: false })), NO_STOP))
  T(`${UNIT}: the limit text inside an assistant message alone did not`,
    same(finalResult(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: LIMIT_TEXT }] } })), NO_STOP))
  T(`${UNIT}: a later successful result replaces an earlier limit result`, same(finalResult([limitResultLine(), resultLine("done", { isError: false })].join("\n")), NO_STOP))
  T(`${UNIT}: a log with no result line did not`, same(finalResult(`${assistantLine}\nnot json\n`), NO_STOP))

  const signIn = finalResult([assistantLine, signInFailureLines()].join("\n"))
  T(`${UNIT}: the CLI's sign-in failure is an authentication failure, not a usage limit`,
    same(signIn, { usageLimitReached: false, authenticationFailed: true, error: SIGN_IN_TEXT }), JSON.stringify(signIn))
  const otherApiError = finalResult([JSON.stringify({ type: "assistant", message: { content: [] }, error: "rate_limit", is_api_error_message: true }), resultLine(TRANSIENT_TEXT)].join("\n"))
  T(`${UNIT}: an API error with another tag is not an authentication failure`, otherApiError.authenticationFailed === false, JSON.stringify(otherApiError))
  const recovered = finalResult([signInFailureLines(), assistantLine, resultLine("done", { isError: false })].join("\n"))
  T(`${UNIT}: a later successful result replaces an earlier authentication failure`, same(recovered, NO_STOP), JSON.stringify(recovered))
  const signInThenOther = finalResult([signInFailureLines(), assistantLine, resultLine(TRANSIENT_TEXT)].join("\n"))
  T(`${UNIT}: an authentication tag before an earlier result does not mark a later one`, signInThenOther.authenticationFailed === false, JSON.stringify(signInThenOther))

  const long = stage("claude-usage-limit/long.log", `${"x".repeat(400 * 1024)}\n${assistantLine}\n${limitResultLine()}\n`)
  T(`${UNIT}: the tail of a log longer than the read window still shows the limit`, logFinalResult(long).usageLimitReached)
  const signInLog = stage("claude-usage-limit/sign-in.log", `${assistantLine}\n${signInFailureLines()}\n`)
  T(`${UNIT}: a log that ends at the sign-in failure reports it`, logFinalResult(signInLog).authenticationFailed)
  T(`${UNIT}: an absent log reports no stop`, same(logFinalResult(`${long}.absent`), NO_STOP))
}
