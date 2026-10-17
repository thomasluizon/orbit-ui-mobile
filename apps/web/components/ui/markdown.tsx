'use client'

import { memo, useMemo, type ReactNode } from 'react'
import { BlockCopyControl } from './block-copy-control'
import { marked, Renderer, type Token, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { getMarkdownImageLabel } from '@orbit/shared/utils'

interface MarkdownProps {
  content: string
  className?: string
  copyableBlocks?: boolean
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
  constructor(private readonly tightList = false) { super() }

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
    return super.code({ ...token, lang: undefined })
  }

  override paragraph(token: Tokens.Paragraph): string {
    return this.tightList ? this.parser.parseInline(token.tokens) : super.paragraph(token)
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
  const tokens = useMemo(() => marked.lexer(content), [content])
  const html = useMemo(() => copyableBlocks ? '' : proseHtml(tokens), [tokens, copyableBlocks])
  if (!content) return null
  const proseClassName = className ? `prose-orbit ${className}` : 'prose-orbit'
  return copyableBlocks
    ? <div className={proseClassName}><CopyableTokens tokens={tokens} /></div>
    : <ProseHtml html={html} className={proseClassName} />
}

function proseHtml(tokens: Token[], tightList = false): string {
  const raw = marked.parser(tokens, { renderer: new ProseRenderer(tightList) })
  // Node's DOMPurify export has isSupported=false and no sanitize; the renderer enforces the policy before this client pass. https://github.com/thomasluizon/orbit-tickets/issues/314
  const sanitized = DOMPurify.isSupported ? DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR }) : raw
  return sanitized.replaceAll('<pre>', '<pre tabindex="0">').replaceAll('<table>', '<table tabindex="0">')
}

const ProseHtml = memo(function ProseHtml({ html, className }: Readonly<{ html: string; className?: string }>) {
  return <div
    className={className}
    data-prose-html
    style={className ? undefined : { display: 'contents' }}
    // react-doctor-disable-next-line dangerous-html-sink -- the renderer escapes raw HTML, validates hrefs and emits allowlisted tags; DOMPurify adds client sanitization at this single sink https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    dangerouslySetInnerHTML={{ __html: html }}
  />
})

function CopyableTokens({ tokens, tightList = false }: Readonly<{ tokens: Token[]; tightList?: boolean }>) {
  const blocks: ReactNode[] = []
  let prose: Token[] = []
  let proseStart = 0
  const flushProse = () => {
    if (prose.length > 0) blocks.push(<ProseHtml key={`prose-${proseStart}`} html={proseHtml(prose, tightList)} />)
    prose = []
  }
  tokens.forEach((token, index) => {
    if (token.type === 'code' || token.type === 'blockquote' || token.type === 'list') {
      flushProse()
      blocks.push(<CopyableToken key={index} token={token as Tokens.Code | Tokens.Blockquote | Tokens.List} />)
    } else {
      if (prose.length === 0) proseStart = index
      prose.push(token)
    }
  })
  flushProse()
  return <>{blocks}</>
}

function CopyableToken({ token }: Readonly<{ token: Tokens.Code | Tokens.Blockquote | Tokens.List }>) {
  if (token.type === 'code') return <div data-copyable-block>
    <div data-copy-control><BlockCopyControl key={token.text} text={token.text} /></div>
    <pre tabIndex={0}><code translate="no">{token.text}</code></pre>
  </div>
  if (token.type === 'blockquote') return <blockquote><CopyableTokens tokens={token.tokens} /></blockquote>
  const List = token.ordered ? 'ol' : 'ul'
  return <List>{token.items.map((item, index) => <li key={index}><CopyableTokens tokens={item.tokens} tightList={!item.loose} /></li>)}</List>
}
