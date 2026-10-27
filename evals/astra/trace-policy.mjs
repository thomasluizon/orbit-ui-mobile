import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

export const { tools, legacyTools } = parse(readFileSync(new URL('./catalog.yaml', import.meta.url), 'utf8'))
export const normalizeField = (name) => name.replaceAll('_', '').replaceAll('-', '').toLowerCase()
export const toolSensitiveFields = new Map(tools.map((tool) => [tool.function.name, new Set(tool.sensitiveFields)]))

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
