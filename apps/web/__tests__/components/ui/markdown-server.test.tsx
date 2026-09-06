// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/ui/markdown'

describe('Markdown server rendering', () => {
  it.each([
    '[docs](https://example.com)',
    '[docs](http://example.com)',
    '[docs](HTTPS://example.com)',
    '[docs](//example.com/path)',
    '[docs](//example.org/docs?view=full#notes)',
    'https://example.com',
    '<https://example.com>',
  ])('isolates absolute links without browser globals: %s', (content) => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const markup = renderToStaticMarkup(<Markdown content={content} />)
    expect(markup).toMatch(/<a href="(?:https?:)?\/\//i)
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
  })

  it.each(['mailto:a@b.com', '/habits', './habits', '../habits', '?view=full', '#notes'])('preserves the current context for %s', (href) => {
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

  it('keeps unsupported Markdown elements and attributes out of server markup', () => {
    const content = [
      '#### Heading',
      '~~removed~~',
      '![image](https://example.com/image.png)',
      '---',
      '- [x] task',
      '3. third',
      '```js\ncode\n```',
      '| column |\n| :---: |\n| cell |',
    ].join('\n\n')
    const markup = renderToStaticMarkup(<Markdown content={content} />)
    expect(markup).not.toMatch(/<(?:h4|del|img|hr|input)\b/)
    expect(markup).not.toMatch(/\s(?:start|align|title)=/)
    expect(markup).not.toContain('language-js')
    for (const text of ['Heading', 'removed', 'task', 'third', 'code', 'column', 'cell']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('<pre tabindex="0">')
    expect(markup).toContain('<table tabindex="0">')
  })

  it.each(['script', 'style', 'textarea'])('escapes nested markup inside inline %s tags', (tag) => {
    const content = `before <${tag}><img src=x onerror=alert(1)></${tag}> after`
    const markup = renderToStaticMarkup(<Markdown content={content} />)
    expect(markup).toContain(`&lt;${tag}&gt;&lt;img`)
    expect(markup).toContain(`&lt;/${tag}&gt; after`)
    expect(markup).not.toContain(`<${tag}`)
    expect(markup).not.toContain('<img')
  })
})
