'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
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
]
const ALLOWED_ATTR = ['href', 'target', 'rel']

/**
 * The single web markdown renderer for chat messages and habit/goal
 * descriptions. Parses with `marked`, then sanitizes through DOMPurify with a
 * fixed tag/attribute allowlist (no scripts, no event handlers, links only) and
 * renders inside the `.prose-orbit` typographic scope.
 */
export function Markdown({ content, className }: Readonly<MarkdownProps>) {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false }) as string // NOSONAR - marked.parse with async:false returns string but typed as string | Promise<string>
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    })
  }, [content])

  if (!html) return null

  return (
    <div
      className={className ? `prose-orbit ${className}` : 'prose-orbit'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
