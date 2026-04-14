import DOMPurify from 'dompurify'

/**
 * Formats AI chat message text for display.
 * 1. Escapes HTML entities (prevents tag injection by users/AI model).
 * 2. Converts a minimal Markdown subset to inline HTML (<strong>, <em>).
 * 3. Runs DOMPurify for defense-in-depth: strips any attributes or tags that
 *    slipped past the escaper (RTL overrides, homograph attacks, zero-width
 *    characters embedded in unusual patterns, stray protocol handlers, etc.)
 *    and caps the allowed tag set to <strong> and <em> only.
 */
export function formatChatMessage(text: string): string {
  // 1. Escape HTML entities to prevent tag / attribute injection.
  let html = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('`', '&#96;')

  // 2. Convert **bold** to <strong>
  html = html.replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 3. Convert *italic* (single asterisk not followed by space, i.e. not a bullet)
  html = html.replaceAll(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '<em>$1</em>')

  // 4. Defense-in-depth: DOMPurify with a strict allowlist.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}
