// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/ui/markdown'

describe('Markdown server rendering', () => {
  it.each([
    '[docs](https://example.com)',
    '[docs](http://example.com)',
    '[docs](HTTPS://example.com)',
    'https://example.com',
    '<https://example.com>',
  ])('isolates absolute links without browser globals: %s', (content) => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const markup = renderToStaticMarkup(<Markdown content={content} />)
    expect(markup).toMatch(/<a href="https?:/i)
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
  })

  it.each(['mailto:a@b.com', '/habits', '#notes'])('preserves the current context for %s', (href) => {
    const markup = renderToStaticMarkup(<Markdown content={`[label](${href})`} />)
    expect(markup).toContain(`<a href="${href}">label</a>`)
    expect(markup).not.toContain('target=')
    expect(markup).not.toContain('rel=')
  })

  it.each([
    '<a href="https://example.com">docs</a>',
    '<a href="http://example.com" target="_self" rel="opener">docs</a>',
    '<a href="https://example.com" target="_blank">docs</a>',
    '<a href="/habits">habits</a>',
    '<a href="/habits" target="_blank" rel="opener">habits</a>',
    '<a href="#notes" target="_blank" rel="opener">notes</a>',
    '<a href="mailto:a@b.com" target="_blank" rel="opener">mail</a>',
    '<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a><script>alert(1)</script>',
  ])('escapes raw HTML without a DOM: %s', (content) => {
    const markup = renderToStaticMarkup(<Markdown content={content} />)
    expect(markup).toContain('&lt;a href=&quot;')
    expect(markup).toContain('&lt;/a&gt;')
    expect(markup).not.toContain('<a')
    expect(markup).not.toContain('<script')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox(1)'])('rejects unsafe Markdown href %s', (href) => {
    const markup = renderToStaticMarkup(<Markdown content={`[label](${href})`} />)
    expect(markup).toContain('<a>label</a>')
    expect(markup).not.toContain('href=')
    expect(markup).not.toContain('target=')
  })

  it('escapes attributes and preserves formatted link labels on the server', () => {
    const markup = renderToStaticMarkup(
      <Markdown content={'[**docs**](https://example.com/?a=1&b=2 "A &quot;title&quot;")'} />,
    )
    expect(markup).toContain('href="https://example.com/?a=1&amp;b=2"')
    expect(markup).toContain('<strong>docs</strong></a>')
    expect(markup).not.toContain('title=')
  })
})
