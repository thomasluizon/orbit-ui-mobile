import { readFileSync } from 'node:fs'

// The recordings predate orbit-api 2f49ed78f (#1109), which declares a nullable target_ids on each ask option. The strict
// schema requires every declared property, so each recorded option gets the null that the current API sends. The JSON
// file stays the recorded evidence.
const withOptionTargets = (call) => (Array.isArray(call.arguments?.input?.options) ? { ...call, arguments: {
  ...call.arguments, input: { ...call.arguments.input,
    options: call.arguments.input.options.map((option) => ({ target_ids: null, ...option })) },
} } : call)

export const recordedGateThirteen = () => JSON.parse(readFileSync(new URL('./gate-thirteen.json', import.meta.url), 'utf8'))
  .map((attempt) => (attempt.toolCalls ? { ...attempt, toolCalls: attempt.toolCalls.map(withOptionTargets) } : attempt))
