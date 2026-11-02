// Mirror ToolSchemaReferences.Resolve: aliases resolve at the parameters root, without expanding recursive objects.
export function resolveSchema(schema, root = schema) {
  const visited = new Set()
  while (schema && typeof schema === 'object' && Object.hasOwn(schema, '$ref')) {
    const reference = schema.$ref
    if (visited.has(reference)) throw new Error('Cyclic schema alias.')
    visited.add(reference)
    if (reference === '#') schema = root
    else {
      if (typeof reference !== 'string' || !reference.startsWith('#/')) {
        throw new Error('Only local schema references are supported.')
      }
      schema = root
      for (const encoded of reference.slice(2).split('/')) {
        const segment = decodeURIComponent(encoded).replaceAll('~1', '/').replaceAll('~0', '~')
        if (!schema || typeof schema !== 'object' || !Object.hasOwn(schema, segment)) {
          throw new Error(`Missing local schema reference: ${reference}`)
        }
        schema = schema[segment]
      }
    }
  }
  return schema
}

export function schemaVariants(schema, root = schema, visited = new Set()) {
  const resolved = resolveSchema(schema, root)
  if (!resolved) return []
  if (!resolved.anyOf) return [resolved]
  if (visited.has(resolved)) throw new Error('Cyclic schema union.')
  return resolved.anyOf.flatMap((variant) => schemaVariants(variant, root, new Set([...visited, resolved])))
}

export const nullableSchema = (schema, root = schema) => schemaVariants(schema, root)
  .some((variant) => variant.type === 'null' || (Array.isArray(variant.type) && variant.type.includes('null')))

export const completionControls = (schema) => ['orbit_read_complete', 'orbit_write_complete']
  .filter((name) => Object.hasOwn(resolveSchema(schema)?.properties ?? {}, name))
