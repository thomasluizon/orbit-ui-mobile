import { readFileSync } from "node:fs"
import { readSessionContext, readSessionMetrics, TRANSCRIPT_TAIL_BYTES } from "../lib/session-context.mjs"
import { T, stage } from "./_harness.mjs"

const usage = JSON.parse(readFileSync(new URL("./fixtures/session-usage.json", import.meta.url), "utf8"))
const call = (id, tokens) => JSON.stringify({ type: "assistant", timestamp: "<ISO-8601 timestamp>", message: { id, model: "claude-opus-5-5", usage: { ...usage, cache_read_input_tokens: tokens - 670 } } })

export const cases = async () => {
  const transcript = stage("session-context/calls.jsonl", `${call("first", 399999)}\n${call("last", 400000)}\n`)
  T("session-context: last call sums to threshold", readSessionContext(transcript) === 400000)
  const metrics = await readSessionMetrics(transcript)
  T("session-context: counts calls and growth", metrics.calls === 2 && metrics.growthPerCall[0] === 1)
  const repeated = stage("session-context/repeated.jsonl", `${call("first", 399999)}\n${call("first", 399999)}\n`)
  T("session-context: streamed blocks count one assistant call", (await readSessionMetrics(repeated)).calls === 1)
  const long = stage("session-context/long.jsonl", `${"x".repeat(TRANSCRIPT_TAIL_BYTES + 100)}\n${call("last", 400000)}\n{"type":`)
  T("session-context: tail skips partial records", readSessionContext(long) === 400000)
  const unrelated = stage("session-context/unrelated.jsonl", `${call("last", 399999)}\n{"type":"user","message":{"usage":{"input_tokens":999999}}}\n`)
  T("session-context: non-assistant usage is ignored", readSessionContext(unrelated) === 399999)
  let unreadable = false
  try { readSessionContext("/absent-transcript") } catch { unreadable = true }
  T("session-context: unreadable transcript is reported to caller", unreadable)
}
