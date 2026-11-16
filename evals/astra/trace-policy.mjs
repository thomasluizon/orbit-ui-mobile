import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { completionControls } from './tool-schema.mjs'

const catalog = parse(readFileSync(new URL('./catalog.yaml', import.meta.url), 'utf8'))
export const { tools, legacyTools, postReadTools, habitSetupTools, habitSetupBinding,
  offerTools = [], offerPostReadTools = [], offerHabitSetupTools = [] } = catalog
const allTools = [...tools, ...legacyTools, ...postReadTools, ...habitSetupTools, ...offerTools, ...offerPostReadTools, ...offerHabitSetupTools]
export const toolCompletionControls = new Map(tools.map((tool) => [tool.function.name, completionControls(tool.function.parameters)]))
export const toolWrites = new Map(allTools.map((tool) => [tool.function.name, tool.writes]))
export const normalizeField = (name) => name.replaceAll('_', '').replaceAll('-', '').toLowerCase()
export const toolSensitiveFields = new Map(allTools.map((tool) => [tool.function.name, new Set(tool.sensitiveFields)]))

// Both eval runs read the tool lists of this catalog: the launch corpus grades tool calls against them, and both runs
// keep only the declared, non-sensitive call arguments in their private evidence (evidence.mjs). So both refuse, with one
// check and one message, an API built from a commit other than the one that the catalog was generated at.
export function requireCatalogCommit(servedCommit) {
  if (!/^[a-f0-9]{40}$/u.test(catalog.apiCommit) || catalog.apiCommit !== servedCommit) {
    throw new Error(`Astra catalog ${catalog.apiCommit} differs from API ${servedCommit}. Regenerate from a clean API checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.`)
  }
}

export function observableSchema(schema, sensitiveFields) {
  if (Array.isArray(schema)) return schema.map((entry) => observableSchema(entry, sensitiveFields))
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => {
    if (key === 'properties') return [key, Object.fromEntries(Object.entries(value)
      .filter(([name]) => !sensitiveFields.has(normalizeField(name)))
      .map(([name, property]) => [name, observableSchema(property, sensitiveFields)]))]
    if (key === 'required') return [key, value.filter((name) => !sensitiveFields.has(normalizeField(name)))]
    return [key, observableSchema(value, sensitiveFields)]
  }))
}
