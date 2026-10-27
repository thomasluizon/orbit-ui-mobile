// The budget sits above every read case median with one model call and below the median with a second model call.
export const READ_LATENCY_BUDGET_MILLISECONDS = 10000

const phaseNames = ['moderation', 'context_load', 'prompt_build', 'model_call', 'tool_call', 'save', 'composition', 'budget', 'other']
const validMilliseconds = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const median = (values) => [...values].sort((left, right) => left - right)[1]

export function describeCase(test) {
  const readLatency = test.vars?.composition?.mode === 'data'
    || (test.vars?.composition?.mode === 'fallback' && test.vars?.expectations?.allowed?.length > 0)
  return { ...test.metadata, readLatency: Boolean(readLatency) }
}

function phaseTotals(timing) {
  if (!validMilliseconds(timing?.totalMilliseconds) || !Array.isArray(timing.phases)) return null
  const totals = Object.fromEntries(phaseNames.map((name) => [name, 0]))
  for (const phase of timing.phases) {
    if (!phaseNames.includes(phase?.name) || !validMilliseconds(phase.milliseconds)
      || !validMilliseconds(phase.elapsedMilliseconds)) return null
    totals[phase.name] += phase.milliseconds
  }
  if (phaseNames.some((name) => !timing.phases.some((phase) => phase.name === name))) return null
  // Exclusive phase times partition the API turn, including repeated and overlapping scopes.
  if (Math.abs(Object.values(totals).reduce((sum, value) => sum + value, 0) - timing.totalMilliseconds) > 1) return null
  return totals
}

export function summarizeLatency(attempts) {
  const withoutTiming = (status, reason) => ({ budgetMilliseconds: READ_LATENCY_BUDGET_MILLISECONDS,
    totalMedianMilliseconds: null, phaseMediansMilliseconds: null, status, reason })
  const requested = attempts.filter((entry) => entry.response?.metadata?.astraPreconditionFailure !== true)
  const timings = requested.map((entry) => {
    const trace = entry.response?.output?.trace
    const requestId = entry.testCase.vars?.evalRequestId
    return trace?.state === 'available' && typeof requestId === 'string' && requestId.length > 0
      && trace.requestId === requestId && trace.responseRequestId === requestId ? trace.timing : null
  })
  const phases = timings.map(phaseTotals)
  if (phases.some((entry) => entry === null)) return withoutTiming('fail', 'Missing or malformed request-bound phase timing.')
  if (attempts.length !== 3 || requested.length !== 3) return withoutTiming('incomplete', 'Latency requires exactly three completed chat requests.')
  const totalMedianMilliseconds = median(timings.map((timing) => timing.totalMilliseconds))
  return { budgetMilliseconds: READ_LATENCY_BUDGET_MILLISECONDS, totalMedianMilliseconds,
    phaseMediansMilliseconds: Object.fromEntries(phaseNames.map((name) => [name, median(phases.map((entry) => entry[name]))])),
    status: totalMedianMilliseconds < READ_LATENCY_BUDGET_MILLISECONDS ? 'pass' : 'fail',
    reason: totalMedianMilliseconds < READ_LATENCY_BUDGET_MILLISECONDS ? null : 'Median turn time must be below the read latency budget.' }
}

export function validateLatencySummary(latency) {
  if (!latency || latency.budgetMilliseconds !== READ_LATENCY_BUDGET_MILLISECONDS
    || !['pass', 'fail', 'incomplete'].includes(latency.status)) throw new Error('Missing or incompatible window latency budget.')
  if (latency.totalMedianMilliseconds === null && latency.phaseMediansMilliseconds === null && latency.status !== 'pass') return
  if (!validMilliseconds(latency.totalMedianMilliseconds) || !latency.phaseMediansMilliseconds
    || phaseNames.some((name) => !validMilliseconds(latency.phaseMediansMilliseconds[name]))
    || latency.status !== (latency.totalMedianMilliseconds < READ_LATENCY_BUDGET_MILLISECONDS ? 'pass' : 'fail')) {
    throw new Error('Invalid window latency evidence.')
  }
}
