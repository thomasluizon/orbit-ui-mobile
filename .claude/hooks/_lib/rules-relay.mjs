import { isRelayWaiter } from "../../../tools/lib/run-state.mjs"

const RETRY_MS = 10 * 60_000
const AUTO_COMPACT_FALLBACK_TOKENS = 900_000

export const relayDrainSources = (wakeSources, orphaned = [], backgroundRuns = []) => [
  ...wakeSources.filter((source) => !isRelayWaiter(source) && source.what !== "Context relay retry"),
  ...orphaned,
  ...backgroundRuns,
]

/**
 * A quiet point is a turn end. Inside a turn the session can hold a composed order it has not launched
 * or a failure it has half read. A turn that ends without a block has every in-flight item waiting on
 * a registered wake source, and no launcher left without one. A turn that a Stop hook keeps open is not quiet.
 */
export const atQuietPoint = ({ hookEventName, stopHookActive, orphaned, wakeSources, state }) =>
  hookEventName === "Stop" && !stopHookActive && orphaned.length === 0 &&
  (wakeSources.length > 0 || !Array.isArray(state.remaining) || state.remaining.length === 0)

export const checkRelayStop = ({ enabled, softTokens, hardTokens, state, sessionId, measuredTokens, hookEventName = "Stop", wakeSources = [], orphaned = [], backgroundRuns = [], now = Date.now(), stopHookActive = false }) => {
  if (!enabled || state?.sleep !== true || !sessionId || state.sessionId !== sessionId || measuredTokens < softTokens) return null
  if ((state.relay?.failures ?? 0) >= 2 && measuredTokens >= AUTO_COMPACT_FALLBACK_TOKENS) return { fallback: true }
  if (state.relay?.fallbackUntilCompacted) return null
  const pending = state.relay?.pending === true
  const draining = relayDrainSources(wakeSources, orphaned, backgroundRuns)
  const backgroundMessage = backgroundRuns.length ? ` Wait for background runs: ${backgroundRuns.map((run) => `${run.type} ${run.id}`).join(", ")}.` : ""
  if (!pending) {
    const forced = measuredTokens >= hardTokens
    if (!forced && !atQuietPoint({ hookEventName, stopHookActive, orphaned, wakeSources, state })) {
      if (state.relay?.armed === true) return null
      return { arm: true, message: `Context relay is armed at the soft threshold. Finish the work in front of you: launch a composed order, finish reading a failure. The relay starts at the next turn end with every item waiting on a wake source, or at the hard ceiling of ${hardTokens} tokens.` }
    }
    return { begin: true, forced, message: `Context relay ${forced ? "hard ceiling" : "quiet point"} reached. Launch nothing, including review batches. Drain the live worker launchers, release watchers, background workflows and background subagents.${backgroundMessage} When none remain, run /handoff --relay --sleep, record every open owner question, then run node tools/relay-session.mjs. Never run /questions or ask the owner during a relay.` }
  }
  if (draining.length > 0 || stopHookActive) return null
  if (state.relay.lastAttemptAt && now - Date.parse(state.relay.lastAttemptAt) < RETRY_MS) return null
  return { begin: false, message: "Context relay drain is complete. Launch nothing. Run /handoff --relay --sleep and node tools/relay-session.mjs. Preserve every open owner question and confirm the successor before ending this session." }
}

export const supersededMessage = (successor) => successor
  ? `This session is superseded. Continue in live session ${successor.sessionId}, terminal ${successor.terminal}.` : null
