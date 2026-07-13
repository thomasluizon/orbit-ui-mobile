/**
 * Flattens a markdown snippet into plain inline text for compact previews
 * (e.g. the habit row's description line): strips emphasis/code markers,
 * heading/list/blockquote prefixes, keeps link and image labels, and
 * collapses all whitespace into single spaces.
 */
export function stripInlineMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[([^\][]*)\]\([^()]*\)/g, '$1')
    .replace(/\[([^\][]+)\]\([^()]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/([*_])(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^[^\S\r\n]*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^[^\S\r\n]*>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}
