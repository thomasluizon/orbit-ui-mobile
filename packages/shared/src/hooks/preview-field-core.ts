export interface PreviewFieldInput {
  path: readonly (string | number)[]
  name: string
  value: string | boolean
  kind: 'text' | 'number' | 'boolean' | 'time'
}

export function previewFieldInputs(value: string, field: string): PreviewFieldInput[] {
  const parsed: unknown = JSON.parse(value)
  const root = field.split('/').at(-1)!
  const source = root === 'repeat_reminder' && typeof parsed === 'object' && parsed !== null
    ? { active_start: '', active_end: '', start_at_utc: '', ...parsed } : parsed
  function visit(current: unknown, path: (string | number)[], name: string): PreviewFieldInput[] {
    if (Array.isArray(current)) return current.flatMap((entry, index) => visit(entry, [...path, index], `${name} ${index + 1}`))
    if (current !== null && typeof current === 'object') return Object.entries(current)
      .flatMap(([key, entry]) => visit(entry, [...path, key], key))
    return [{ path, name, value: typeof current === 'boolean' ? current : typeof current === 'string' || typeof current === 'number' ? String(current) : '',
      kind: typeof current === 'boolean' ? 'boolean' : typeof current === 'number' || name === 'interval_minutes' ? 'number'
        : ['active_start', 'active_end', 'time'].includes(name) ? 'time' : 'text' }]
  }
  return visit(source, [], root)
}

export function changePreviewFieldInput(value: string, input: PreviewFieldInput, next: string | boolean): string {
  const parsed: unknown = JSON.parse(value)
  function replace(current: unknown, path: readonly (string | number)[]): unknown {
    if (!path.length) return input.kind === 'number' && typeof next === 'string' && next.trim() && Number.isFinite(Number(next)) ? Number(next) : next
    const [key, ...rest] = path
    if (Array.isArray(current) && typeof key === 'number') return current.map((entry: unknown, index) => index === key ? replace(entry, rest) : entry)
    if (typeof current !== 'object' || current === null || typeof key !== 'string') throw new Error('Invalid preview path')
    const record = current as Record<string, unknown>
    const updated = { ...record, [key]: replace(record[key], rest) }
    if (next === '' && ['active_start', 'active_end', 'start_at_utc'].includes(key)) delete updated[key]
    return updated
  }
  return JSON.stringify(replace(parsed, input.path))
}
