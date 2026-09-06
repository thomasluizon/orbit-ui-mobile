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

class ProseLinkRenderer extends Renderer {
  override link(token: Tokens.Link): string {
    const anchor = super.link(token)
    return /^https?:/i.test(token.href)
      ? anchor.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ')
      : anchor
  }
}

/**
 * The single web markdown renderer for chat messages and habit/goal
 * descriptions. Parses with `marked`, then sanitizes through DOMPurify with a
 * fixed tag/attribute allowlist (no scripts, no event handlers, links only) and
 * renders inside the `.prose-orbit` typographic scope.
 */
export function Markdown({ content, className }: Readonly<MarkdownProps>) {
  const renderer = useMemo(() => new ProseLinkRenderer(), [])
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
