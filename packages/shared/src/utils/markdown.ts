import { decode } from 'html-entities'
import type { Token, Tokens } from 'marked'

type ImageLabelToken = Tokens.Br | Tokens.Codespan | Tokens.Del | Tokens.Em | Tokens.Escape
  | Tokens.Image | Tokens.Link | Tokens.Strong | Tokens.Tag | Tokens.Text

function imageLabelText(tokens: Token[]): string {
  return (tokens as ImageLabelToken[]).map((token) => {
    if (token.type === 'image') return getMarkdownImageLabel(token)
    if ('tokens' in token && token.tokens) return imageLabelText(token.tokens)
    if (token.type === 'br') return '\n'
    if (token.type === 'text' && !token.escaped) return decode(token.text, { scope: 'strict' })
    return token.text
  }).join('')
}

export function getMarkdownImageLabel({ title, tokens }: Pick<Tokens.Image, 'text' | 'title' | 'tokens'>): string {
  return imageLabelText(tokens) || title || ''
}

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
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^[ \t]*>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}
