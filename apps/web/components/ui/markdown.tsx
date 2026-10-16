'use client'

import { memo, useCallback, useMemo, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { BlockCopyControl } from './block-copy-control'
import { marked, Renderer, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { getMarkdownImageLabel } from '@orbit/shared/utils'

interface MarkdownProps {
  content: string
  className?: string
  copyableBlocks?: boolean
}

const ALLOWED_TAGS = [
  'div',
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
const ALLOWED_ATTR = ['href', 'target', 'rel', 'data-copy-control', 'data-copyable-block']
const LINK_BASE_ORIGIN = 'https://markdown.invalid'
const LINK_COMPARISON_ORIGIN = 'https://markdown-secondary.invalid'

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function linkAttributes(href: string): string {
  try {
    const { protocol, origin } = new URL(href, LINK_BASE_ORIGIN)
    if (!/^(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):$/i.test(protocol)) return ''
    const external = (protocol === 'http:' || protocol === 'https:')
      && origin === new URL(href, LINK_COMPARISON_ORIGIN).origin
    const context = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return ` href="${escapeHtml(href)}"${context}`
  } catch {
    return ''
  }
}

class ProseRenderer extends Renderer {
  constructor(private readonly copyableBlocks = false) { super() }

  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text)
  }

  override link({ href, tokens }: Tokens.Link): string {
    return `<a${linkAttributes(href)}>${this.parser.parseInline(tokens)}</a>`
  }

  override image(image: Tokens.Image): string {
    return escapeHtml(getMarkdownImageLabel(image)).replaceAll('\n', '<br>')
  }

  override hr(): string {
    return ''
  }

  override checkbox(): string {
    return ''
  }

  override del({ tokens }: Tokens.Del): string {
    return this.parser.parseInline(tokens)
  }

  override heading(token: Tokens.Heading): string {
    return token.depth <= 3 ? super.heading(token) : `${this.parser.parseInline(token.tokens)}\n`
  }

  override code(token: Tokens.Code): string {
    return this.copyableBlocks
      ? `<div data-copyable-block><div data-copy-control></div><pre><code>${escapeHtml(token.text)}</code></pre></div>\n`
      : super.code({ ...token, lang: undefined })
  }

  override list(token: Tokens.List): string {
    return super.list({ ...token, start: 1 })
  }

  override tablecell(token: Tokens.TableCell): string {
    return super.tablecell({ ...token, align: null })
  }
}

/**
 * The single web markdown renderer for chat messages and habit/goal
 * descriptions. Escapes raw HTML and emits allowlisted Markdown on both server
 * and client, with DOMPurify providing additional client-side sanitization.
 */
export function Markdown({ content, className, copyableBlocks = false }: Readonly<MarkdownProps>) {
  const renderer = useMemo(() => new ProseRenderer(copyableBlocks), [copyableBlocks])
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false, renderer })
    // Node's DOMPurify export has isSupported=false and no sanitize; the renderer enforces the policy before this client pass. https://github.com/thomasluizon/orbit-tickets/issues/314
    const sanitized = DOMPurify.isSupported ? DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR }) : raw
    return sanitized
      .replaceAll('<pre>', '<pre tabindex="0">')
      .replaceAll('<table>', '<table tabindex="0">')
  }, [content, renderer])

  if (!html) return null

  if (copyableBlocks) return <CopyableProse key={html} html={html} className={className} />

  return <ProseHtml html={html} className={className} />
}

const ProseHtml = memo(function ProseHtml({ html, className, containerRef }: Readonly<{
  html: string; className?: string; containerRef?: Ref<HTMLDivElement>
}>) {
  return <div
    ref={containerRef}
    className={className ? `prose-orbit ${className}` : 'prose-orbit'}
    // react-doctor-disable-next-line dangerous-html-sink -- the renderer escapes raw HTML, validates hrefs and emits allowlisted tags; DOMPurify adds client sanitization at this single sink https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    dangerouslySetInnerHTML={{ __html: html }}
  />
})


function CopyableProse({ html, className }: Readonly<{ html: string; className?: string }>) {
  const [blocks, setBlocks] = useState<{ host: HTMLElement; text: string }[]>([])
  const attachControls = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const targets = [...node.querySelectorAll<HTMLElement>('[data-copy-control]')].map(host => ({
      host,
      text: host.nextElementSibling?.textContent ?? '',
    }))
    setBlocks(targets)
  }, [])
  return <>
    <ProseHtml containerRef={attachControls} html={html} className={className} />
    {blocks.map(({ host, text }, index) => createPortal(<BlockCopyControl text={text} />, host, String(index)))}
  </>
}
