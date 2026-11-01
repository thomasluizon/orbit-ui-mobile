import { assertions } from 'promptfoo'
import { resolveSchema, schemaVariants } from './tool-schema.mjs'

const run = (call, catalog, context) => assertions.runAssertion({
  assertion: { type: 'is-valid-openai-tools-call' },
  provider: { config: { tools: catalog } }, test: context.test,
  providerResponse: { output: [{ type: 'function',
    function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] },
})

function selectedAskForm(catalog, form) {
  return catalog.map((tool) => {
    if (tool.function.name !== 'ask') return tool
    const root = tool.function.parameters
    const branch = schemaVariants(root.properties.input, root)
      .find((schema) => resolveSchema(schema.properties?.form, root)?.enum?.includes(form))
    return branch ? { ...tool, function: { ...tool.function, parameters: {
      ...root, properties: { ...root.properties, input: branch },
    } } } : tool
  })
}

export async function validateToolArguments(call, catalogs, context) {
  const failures = []
  for (const catalog of catalogs) {
    const verdict = await run(call, catalog, context)
    if (verdict.pass) return verdict
    failures.push(verdict)
  }
  const form = call.name === 'ask' ? call.arguments?.input?.form : undefined
  if (!['choice', 'pickList', 'question'].includes(form)) return failures[0]
  const diagnostics = await Promise.all(catalogs.map((catalog) => run(call, selectedAskForm(catalog, form), context)))
  const closest = diagnostics.toSorted((left, right) => left.reason.length - right.reason.length)[0]
  return { ...closest, pass: false, score: 0, reason: `ask ${form}: ${closest.reason}` }
}
