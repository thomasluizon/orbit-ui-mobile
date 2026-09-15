'use client'

import { useMemo } from 'react'
import { marked, Renderer, type Tokens } from 'marked'
import DOMPurify from 'dompurify'

interface MarkdownProps {
  content: string
  className?: string
}

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]
const ALLOWED_ATTR = ['href', 'target', 'rel']
const LINK_BASE_ORIGIN = 'https://markdown.invalid'
const LINK_COMPARISON_ORIGIN = 'https://markdown-secondary.invalid'

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function linkAttributes(href: string, title?: string | null): string {
  let target = ''
  try {
    const resolved = new URL(href, LINK_BASE_ORIGIN)
    const comparison = new URL(href, LINK_COMPARISON_ORIGIN)
    if (
      (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
      resolved.origin === comparison.origin
    ) {
      target = ' target="_blank" rel="noopener noreferrer"'
    }
  } catch {
    return ''
  }
  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : ''
  return ` href="${escapeAttribute(href)}"${titleAttribute}${target}`
}

class ProseRenderer extends Renderer {
  override link({ href, title, tokens }: Tokens.Link): string {
    return `<a${linkAttributes(href, title)}>${this.parser.parseInline(tokens)}</a>`
  }
}

/**
 * The single web markdown renderer for chat messages and habit/goal
 * descriptions. Parses with `marked`, then sanitizes through DOMPurify with a
 * fixed tag/attribute allowlist (no scripts, no event handlers, links only) and
 * renders inside the `.prose-orbit` typographic scope.
 */
export function Markdown({ content, className }: Readonly<MarkdownProps>) {
  const renderer = useMemo(() => new ProseRenderer(), [])
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false, renderer })
    const sanitized = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    })
    return sanitized
      .replaceAll('<pre>', '<pre tabindex="0">')
      .replaceAll('<table>', '<table tabindex="0">')
  }, [content, renderer])

  if (!html) return null

  return (
    <div
      className={className ? `prose-orbit ${className}` : 'prose-orbit'}
      // react-doctor-disable-next-line dangerous-html-sink -- html is marked.parse() then DOMPurify.sanitize()'d with a fixed tag/attr allowlist (no scripts, no event handlers, links only); this is the app's single sanitized markdown sink https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
