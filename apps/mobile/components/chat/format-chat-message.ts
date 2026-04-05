/**
 * Formats AI chat message text for display.
 * Escapes HTML first (preventing XSS), then converts basic markdown to HTML.
 * Since we escape ALL HTML entities before adding our own safe tags,
 * the output is inherently safe without needing DOMPurify.
 */
export function formatChatMessage(text: string): string {
  // 1. Escape HTML entities to prevent XSS
  let html = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  // 2. Convert **bold** to <strong>
  html = html.replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 3. Convert *italic* (single asterisk not followed by space, i.e. not a bullet)
  html = html.replaceAll(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '<em>$1</em>')

  return html
}
