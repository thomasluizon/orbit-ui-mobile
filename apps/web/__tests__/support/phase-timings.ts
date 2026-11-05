import { performance } from 'node:perf_hooks'

export function phaseTimings(label: string) {
  let previous = performance.now()
  return (phase: string) => {
    const current = performance.now()
    if (process.env.ORBIT_TEST_PHASE_TIMINGS) {
      process.stderr.write(`[test phase] ${label} ${phase}: ${(current - previous).toFixed(1)} ms\n`)
    }
    previous = current
  }
}
