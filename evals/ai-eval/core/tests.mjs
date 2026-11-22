import { coreCases, mustPassKOf, situations } from './corpus.mjs'

// The two runs of the gate. Each test carries its own k as its promptfoo repeat; the run reads the k of its must-pass
// cases from ORBIT_EVAL_MUST_PASS_K (core/corpus.mjs mustPassKOf).
const cases = () => coreCases(situations, mustPassKOf())
export const mustPass = () => cases().filter(({ metadata }) => metadata.mustPass)
export const other = () => cases().filter(({ metadata }) => !metadata.mustPass)
