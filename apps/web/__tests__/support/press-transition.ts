function arbitraryList(classes: readonly string[], prefixes: readonly string[]): string[] {
  for (const prefix of prefixes) {
    const name = classes.find((candidate) => candidate.startsWith(prefix) && candidate.endsWith(']'))
    if (name) return name.slice(prefix.length, -1).split(',')
  }
  return []
}

/**
 * Resolves the `scale` leg of an element's Tailwind transition classes as `<duration> <timing function>`,
 * repeating the duration and timing lists the way CSS does. Returns `none` when no class transitions `scale`.
 */
export function scaleTransition(element: Element): string {
  const classes = [...element.classList]
  const properties = arbitraryList(classes, ['transition-['])
  const durations = arbitraryList(classes, ['[transition-duration:', 'duration-['])
  const easings = arbitraryList(classes, ['[transition-timing-function:', 'ease-['])
  const index = properties.indexOf('scale')
  if (index < 0 || durations.length === 0 || easings.length === 0) return 'none'
  return `${durations[index % durations.length]} ${easings[index % easings.length]}`
}
