const RETRY_MS = 10 * 60_000

export const relayDrainSources = (wakeSources, orphaned = [], backgroundRuns = []) => [
  ...wakeSources.filter((source) => !source.what?.startsWith("CI ") && source.what !== "Context relay retry"),
  ...orphaned,
  ...backgroundRuns,
]

export const checkRelayStop = ({ enabled, thresholdTokens, state, sessionId, measuredTokens, wakeSources = [], orphaned = [], backgroundRuns = [], now = Date.now(), stopHookActive = false }) => {
  if (!enabled || state?.sleep !== true || !sessionId || state.sessionId !== sessionId || measuredTokens < thresholdTokens) return null
  if ((state.relay?.failures ?? 0) >= 2 && measuredTokens >= 900000) return { fallback: true }
  if (state.relay?.fallbackUntilCompacted) return null
  const pending = state.relay?.pending === true
  const draining = relayDrainSources(wakeSources, orphaned, backgroundRuns)
  const backgroundMessage = backgroundRuns.length ? ` Wait for background runs: ${backgroundRuns.map((run) => `${run.type} ${run.id}`).join(", ")}.` : ""
  if (!pending) return { begin: true, message: `Context relay threshold reached. Launch nothing, including review batches. Drain the live worker launchers, release watchers, background workflows and background subagents.${backgroundMessage} When none remain, run /handoff --relay --sleep, record every open owner question, then run node tools/relay-session.mjs. Never run /questions or ask the owner during a relay.` }
  if (draining.length > 0 || stopHookActive) return null
  if (state.relay.lastAttemptAt && now - Date.parse(state.relay.lastAttemptAt) < RETRY_MS) return null
  return { begin: false, message: "Context relay drain is complete. Launch nothing. Run /handoff --relay --sleep and node tools/relay-session.mjs. Preserve every open owner question and confirm the successor before ending this session." }
}

export const supersededMessage = (successor) => successor
  ? `This session is superseded. Continue in live session ${successor.sessionId}, terminal ${successor.terminal}.` : null
