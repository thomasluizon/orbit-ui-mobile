import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

export const ATTEMPTS_PER_CASE = parse(readFileSync(new URL('./promptfooconfig.yaml', import.meta.url), 'utf8')).evaluateOptions.repeat
if (!Number.isSafeInteger(ATTEMPTS_PER_CASE) || ATTEMPTS_PER_CASE < 1) {
  throw new Error('Configure a positive integer evaluateOptions.repeat for the Astra gate.')
}
