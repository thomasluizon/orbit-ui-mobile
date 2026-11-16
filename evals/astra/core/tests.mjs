import { coreCases } from './corpus.mjs'

// The two runs of the gate: promptfoo repeats every test of one run the same number of times.
export const mustPass = () => coreCases().filter(({ metadata }) => metadata.mustPass)
export const other = () => coreCases().filter(({ metadata }) => !metadata.mustPass)
