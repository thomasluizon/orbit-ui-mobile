import { assertions } from 'promptfoo'
import { resolveSchema, schemaVariants } from './tool-schema.mjs'

const run = (call, catalog, context) => assertions.runAssertion({
  assertion: { type: 'is-valid-openai-tools-call' },
  provider: { config: { tools: catalog } }, test: context.test,
  providerResponse: { output: [{ type: 'function',
    function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] },
})

// The ask declaration with only the branch of the form that the call is closest to. The ai_change_plan ask declares two
// choice branches, so the branch that declares the most fields of the call wins.
function selectedAskForm(catalog, input) {
  return catalog.map((tool) => {
    if (tool.function.name !== 'ask') return tool
    const root = tool.function.parameters
    const declared = (schema) => Object.keys(input).filter((name) => Object.hasOwn(schema.properties ?? {}, name)).length
    const [branch] = schemaVariants(root.properties.input, root)
      .filter((schema) => resolveSchema(schema.properties?.form, root)?.enum?.includes(input.form))
      .toSorted((left, right) => declared(right) - declared(left))
    return branch ? { ...tool, function: { ...tool.function, parameters: {
      ...root, properties: { ...root.properties, input: branch },
    } } } : tool
  })
}

// The verdict for one call of a trace, and the lists that still hold after it. One API serves one declaration shape, so
// the next call of the trace is read only against the lists that accepted this one.
export async function validateTraceCall(call, catalogs, context) {
  const verdicts = await Promise.all(catalogs.map((catalog) => validateToolArguments(call, [catalog], context)))
  const open = catalogs.filter((_, index) => verdicts[index].pass)
  if (open.length) return { verdict: verdicts[verdicts.findIndex(({ pass }) => pass)], open }
  return { verdict: await validateToolArguments(call, catalogs, context), open }
}

export async function validateToolArguments(call, catalogs, context) {
  const failures = []
  for (const catalog of catalogs) {
    const verdict = await run(call, catalog, context)
    if (verdict.pass) return verdict
    failures.push(verdict)
  }
  const form = call.name === 'ask' ? call.arguments?.input?.form : undefined
  // The lists of more than one declaration shape can refuse a call for different reasons, so the verdict holds each one.
  if (!['choice', 'pickList', 'question'].includes(form)) {
    return { ...failures[0], reason: [...new Set(failures.map(({ reason }) => reason))].join('\n') }
  }
  const diagnostics = await Promise.all(catalogs.map((catalog) => run(call, selectedAskForm(catalog, call.arguments.input), context)))
  const closest = diagnostics.toSorted((left, right) => left.reason.length - right.reason.length)[0]
  return { ...closest, pass: false, score: 0, reason: `ask ${form}: ${closest.reason}` }
}
