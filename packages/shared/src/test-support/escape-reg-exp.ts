/** Escape every regex character of a text, so a message used as a RegExp matches itself and nothing else. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
