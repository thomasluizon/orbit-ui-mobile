/** Uppercase 1–2 letter initials for a display name: the first two letters of a single word, or
 *  the first letters of the first and last words, falling back to '?' when the name is blank. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase()
}
