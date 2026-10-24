import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { loadApiProvider } from 'promptfoo'
import { behavior, composition, structural } from './assertions.mjs'

export async function prepareCorrection(test) {
  const setup = test.vars.setup
  const requestId = randomUUID()
  const configuration = parse(readFileSync(new URL('./promptfooconfig.yaml', import.meta.url), 'utf8'))
  const provider = await loadApiProvider('http', { options: { config: {
    ...configuration.providers[0].config, transformResponse: `file://${fileURLToPath(new URL('./response.mjs', import.meta.url))}`,
  } } })
  const vars = { ...test.vars, ...setup, evalRequestId: requestId, historyJson: '[]' }
  const response = await provider.callApi(setup.input, { vars })
  if (response.error || !response.output) throw new Error('Correction setup returned no verifiable answer.')
  const context = { vars, test }
  const checks = await Promise.all([structural(response.output, context), behavior(response.output, context), composition(response.output, context)])
  if (checks.some((check) => check.pass !== true || check.metadata?.skipped || check.metadata?.unavailable)) {
    throw new Error('Correction setup failed its tool or composition gate.')
  }
  test.vars.baselinePreview = response.output.composition.pendingOperations
  const correction = test.vars.composition?.correction
  const operation = test.vars.expectations?.required?.[0]
  if (correction && operation?.exactArguments === true) {
    const original = response.output.trace.calls.find((call) => call.name === operation.name)
    const revised = structuredClone(original?.arguments)
    const targets = revised?.habits?.filter((habit) => typeof habit.title === 'string'
      && habit.title.toLocaleLowerCase().includes(correction.titleContains.toLocaleLowerCase()))
    if (targets?.length !== 1 || !Object.hasOwn(targets[0], correction.field)) {
      throw new Error('Correction setup lacks one verifiable tool argument target.')
    }
    targets[0][correction.field] = correction.value
    operation.arguments = revised
  }
  test.vars.historyJson = JSON.stringify([{ role: 'user', content: setup.input }, { role: 'assistant', content: response.output.answer }])
  return { test }
}
