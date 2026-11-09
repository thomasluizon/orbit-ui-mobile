import { readFileSync } from "node:fs"
import { PRICE_WEIGHTS, buildModel, callCost, costPerWorkCall, growthSlope, mergedDelta, optimalThreshold, parseCalls, recommendThresholds, splitSession } from "../lib/relay-cost.mjs"
import { T } from "./_harness.mjs"

const usage = JSON.parse(readFileSync(new URL("./fixtures/session-usage.json", import.meta.url), "utf8"))
const record = (id, context, { action, timestamp = "2026-11-01T00:00:00.000Z", sidechain = false, output = 100 } = {}) => JSON.stringify({
  type: "assistant", isSidechain: sidechain, timestamp,
  message: { id, usage: { ...usage, input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: context - 1002, output_tokens: output },
    content: action ? [{ type: "tool_use", name: "Bash", input: { command: action } }] : [] },
})
const secondsAfter = (seconds) => new Date(Date.parse("2026-11-01T00:00:00.000Z") + seconds * 1000).toISOString()

/** Entry of three calls, then `workCalls` calls growing by `growth`, then `windDownCalls` after the trigger. */
export const syntheticSession = ({ start = 60000, entryGrowth = 5000, growth = 1500, workCalls = 20, windDownCalls = 4 } = {}) => {
  const lines = []
  let context = start
  let second = 0
  const push = (id, action) => { lines.push(record(id, context, { action, timestamp: secondsAfter(second++) })) }
  for (let index = 0; index < 3; index++) { push(`entry-${index}`, "cat .claude/skills/sleep/SKILL.md"); context += entryGrowth }
  for (let index = 0; index < workCalls; index++) { push(`work-${index}`, index === 0 ? "node tools/launch-worker.mjs --ticket 1" : "git status"); context += growth }
  const triggeredAt = secondsAfter(second)
  for (let index = 0; index < windDownCalls; index++) { push(`wind-${index}`, "git commit"); context += growth }
  return { text: `${lines.join("\n")}\n`, triggeredAt, triggerContext: start + 3 * entryGrowth + workCalls * growth }
}

export const cases = async () => {
  const streamed = `${record("a", 100000)}\n${record("a", 100500)}\n${record("b", 101000, { sidechain: true })}\n{"type":"assistant"}\nnot json\n`
  const calls = parseCalls(streamed)
  T("relay-cost: a streamed call counts once and its last usage wins", calls.length === 1 && calls[0].contextTokens === 100500)
  T("relay-cost: a subagent call is not part of the session", !parseCalls(streamed).some((call) => call.contextTokens === 101000))
  T("relay-cost: context is input plus cache creation plus cache read", calls[0].contextTokens === 2 + 1000 + (100500 - 1002))
  T("relay-cost: a call is priced by the published weights", callCost({ input: 2, cacheCreation: 1000, cacheRead: 100000, output: 100 }) === 2 + 1250 + 5000 + 500)
  T("relay-cost: the weights match the Opus 5.5 price table", PRICE_WEIGHTS.output === 20 / 4 && PRICE_WEIGHTS.cacheRead === 0.2 / 4)

  T("relay-cost: growth slope recovers a linear rise", Math.abs(growthSlope([1, 2, 3, 4].map((index) => ({ contextTokens: 1000 * index }))) - 1000) < 1e-9)
  T("relay-cost: one call has no growth", growthSlope([{ contextTokens: 5 }]) === 0)
  T("relay-cost: shipped delta counts only new pull requests", mergedDelta([{ repository: "ui", pullRequest: 1 }, { repository: "ui", pullRequest: 2 }, { repository: "api", pullRequest: 1 }], [{ repository: "ui", pullRequest: 1 }]) === 2)

  const session = syntheticSession()
  const split = splitSession(parseCalls(session.text), session.triggeredAt)
  T("relay-cost: the entry ends at the first useful action", split.entry.length === 3)
  T("relay-cost: the work runs from that action to the relay trigger", split.work.length === 20)
  T("relay-cost: the wind-down starts at the trigger", split.windDown.length === 4)
  T("relay-cost: the trigger context is the last call before the trigger", split.triggerContext === session.triggerContext - 1500)
  T("relay-cost: work growth is the real slope", Math.abs(split.growthPerWorkCall - 1500) < 1e-6)
  T("relay-cost: a session without a trigger has no wind-down", splitSession(parseCalls(session.text), null).windDown.length === 0)

  const model = buildModel([split, splitSession(parseCalls(syntheticSession({ growth: 1700 }).text), syntheticSession({ growth: 1700 }).triggeredAt)])
  T("relay-cost: the model takes the median entry and growth", model.entryCalls === 3 && model.growthPerWorkCall === 1600)
  T("relay-cost: a session with fewer than ten work calls is not usable", buildModel([splitSession(parseCalls(syntheticSession({ workCalls: 5 }).text), null)]).sessions === 0)

  // With no wind-down and no per-call cost beyond the read, cost per call is E/n + p(c+T)/2, so the minimum has a closed form.
  const closed = { entryEndContext: 100000, growthPerWorkCall: 1500, entryCost: 400000, nonReadCostPerCall: 0, windDownCalls: 0, overshootTokens: 0 }
  const expected = closed.entryEndContext + Math.sqrt(2 * closed.entryCost * closed.growthPerWorkCall / PRICE_WEIGHTS.cacheRead)
  T("relay-cost: the scan finds the closed form minimum", Math.abs(optimalThreshold(closed, { step: 100 }).threshold - expected) <= 100, `${optimalThreshold(closed, { step: 100 }).threshold} vs ${expected}`)
  T("relay-cost: a larger entry cost moves the minimum up", optimalThreshold({ ...closed, entryCost: 800000 }).threshold > optimalThreshold(closed).threshold)
  T("relay-cost: a threshold at or below the entry context has infinite cost", costPerWorkCall(100000, closed) === Number.POSITIVE_INFINITY)
  T("relay-cost: a threshold far above the minimum costs more", costPerWorkCall(800000, closed) > costPerWorkCall(expected, closed))

  const recommended = recommendThresholds({ ...closed, nonReadCostPerCall: 5000, windDownCalls: 20, overshootTokens: 40000 })
  T("relay-cost: the soft threshold is on the 10000 grid", recommended.soft % 10000 === 0 && recommended.hard % 10000 === 0)
  T("relay-cost: the hard ceiling is above the soft threshold and inside the band", recommended.hard > recommended.soft && recommended.hard <= recommended.optimum.bandHigh)
}
