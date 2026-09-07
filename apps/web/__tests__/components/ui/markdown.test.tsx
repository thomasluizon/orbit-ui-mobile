import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Markdown } from '@/components/ui/markdown'

describe('Markdown', () => {
  it.each([
    ['![outer [inner][ref]](image.png)\n\n[ref]: https://example.com', 'outer inner'],
    ['![outer [inner][ref]][picture]\n\n[ref]: https://example.com\n[picture]: image.png', 'outer inner'],
    ['![](image.png "**literal**")', '**literal**'],
    ['[![](image.png "**literal**")](https://example.com/path)', '**literal**'],
  ])('preserves document context and literal titles: %s', (content, label) => {
    const { container, getByRole } = render(<Markdown content={content} />)
    expect(container.textContent.trimEnd()).toBe(label)
    expect(container.querySelector('img, strong')).toBeNull()
    if (content.startsWith('[!')) expect(getByRole('link', { name: label })).toHaveAttribute('href', 'https://example.com/path')
    else expect(container.querySelector('a')).toBeNull()
  })

  describe.each(['bare', 'linked'])('%s image labels', (context) => {
    it.each([
      ['**bold**', 'bold'],
      ['A &amp; B', 'A & B'],
      ['a \\* b', 'a * b'],
      ['**bold** <b title="&amp;">x</b>', 'bold <b title="&amp;">x</b>'],
      ['***nested*** ~~removed~~ `&amp;`', 'nested removed &amp;'],
      ['&#42;literal&#42; &amp;amp; &#x1F680; \\&amp;', '*literal* &amp; 🚀 &amp;'],
    ])('renders semantic plain text for %s', (source, label) => {
      const image = `![${source}](https://example.com/i.png)`
      const content = context === 'linked' ? `[${image}](https://example.com/path)` : image
      const { container, getByRole } = render(<Markdown content={content} />)
      expect(container.textContent.trimEnd()).toBe(label)
      expect(container.querySelector('img, b, strong, em, del, code')).toBeNull()
      if (context === 'linked') expect(getByRole('link', { name: label })).toHaveAttribute('href', 'https://example.com/path')
      else expect(container.querySelector('a')).toBeNull()
    })
  })

  it.each([
    '<a href="https://example.com">docs</a>',
    '<div><a href="http://example.com">docs</a></div>',
    '<a href="HTTPS://example.com" target="_self" rel="opener">docs</a>',
    '<a href="https://example.com" target="_blank" rel="opener">docs</a>',
    '<a href="&#104;ttps://example.com">docs</a>',
    '<a href="  https://example.com  ">docs</a>',
    '<a href="ht&#9;tps://example.com">docs</a>',
    '<a href="&#1;https://example.com">docs</a>',
  ])('renders raw absolute anchors as text: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent.trimEnd()).toBe(content)
  })

  it.each([
    '<a href="/habits" target="_blank" rel="opener">habits</a>',
    '<a href="#notes" target="_blank" rel="opener">notes</a>',
    '<a href="mailto:a@b.com" target="_blank" rel="opener">mail</a>',
    '<a href="/habits" target="named-window">habits</a>',
    '<a href="javascript:alert(1)" target="_blank" rel="opener">unsafe</a>',
    '<a href="data:text/html,unsafe" target="_blank" rel="opener">unsafe</a>',
    '<a target="_blank" rel="opener">no destination</a>',
  ])('renders raw non-web anchors and their supplied targets as text: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent.trimEnd()).toBe(content)
  })

  it.each([
    'see https://useorbit.org for more',
    '[docs](https://markdown.invalid/path)',
    '[docs](//markdown.invalid/path)',
    '[docs](https://useorbit.org/docs)',
    '[docs](http://useorbit.org/docs)',
    '[docs](HTTPS://useorbit.org/docs)',
    '[docs](//example.com/path)',
    '[docs](//example.org/docs?view=full#notes)',
  ])('opens absolute web links outside Orbit: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each([
    ['https://markdown.invalid/path', true],
    ['//markdown.invalid/path', true],
    ['//attacker.example/path', true],
    ['/\\attacker.example/path', true],
    ['\\/attacker.example/path', true],
    ['\\\\attacker.example/path', true],
    ['https://example.com/path', true],
    ['docs/page', false],
    ['/docs/page', false],
    ['?q=1', false],
    ['#section', false],
  ] as const)('names linked images and preserves the destination context for %s', (href, isolated) => {
    const destination = href.replaceAll('\\', '\\\\')
    const { getByRole, container } = render(
      <Markdown content={`[docs](${destination}) [![alt](https://example.com/i.png)](${destination})`} />,
    )
    for (const name of ['docs', 'alt']) {
      const link = getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      if (isolated) {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      } else {
        expect(link).not.toHaveAttribute('target')
        expect(link).not.toHaveAttribute('rel')
      }
    }
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders image labels as text and falls back to the title', () => {
    const { container } = render(
      <Markdown content={'![<b>alt</b>](https://example.com/i.png) ![](https://example.com/i.png "title") ![](https://example.com/i.png)'} />,
    )
    expect(container.textContent.trimEnd()).toBe('<b>alt</b> title')
    expect(container.querySelector('img, b')).toBeNull()
  })

  it.each(['mailto:a@b.com', '/habits', './habits', '../habits', '?view=full', '#notes'])('keeps %s in its current context', (href) => {
    const { container } = render(<Markdown content={`[label](${href})`} />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href', href)
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>'])('sanitizes %s', (href) => {
    const { container } = render(<Markdown content={`[label](${href})`} />)
    const link = container.querySelector('a')
    expect(link).not.toHaveAttribute('href')
    expect(link).not.toHaveAttribute('target')
  })

  it('handles multiple links and preserves inline formatting and escaped attributes', () => {
    const { container } = render(
      <Markdown content={'[**first**](https://useorbit.org/?a=1&b=2 "A &quot;title&quot;") [second](https://useorbit.org/docs)'} />,
    )
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(links[0]).toHaveAttribute('href', 'https://useorbit.org/?a=1&b=2')
    expect(links[0]?.querySelector('strong')).toHaveTextContent('first')
  })

  it('renders bold, lists, and headings from markdown', () => {
    const { container } = render(
      <Markdown content={'# Title\n\n**bold** text\n\n- one\n- two'} />,
    )
    expect(container.querySelector('h1')?.textContent).toBe('Title')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders script tags and event handlers as inert text', () => {
    const { container } = render(
      <Markdown content={'<script>alert(1)</script><img src=x onerror="alert(1)">'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('<script>alert(1)</script><img src=x onerror="alert(1)">')
  })

  it('renders nothing for empty content', () => {
    const { container } = render(<Markdown content="" />)
    expect(container.innerHTML).toBe('')
  })

  it('applies a custom className alongside the prose scope', () => {
    const { container } = render(<Markdown content="hi" className="text-sm" />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('prose-orbit')
    expect(root.className).toContain('text-sm')
  })

  it('keeps tables and makes horizontally scrollable blocks keyboard reachable', () => {
    const fence = '`'.repeat(3)
    const content = [
      `${fence}sh`,
      'command --flag=abcdefghijklmnopqrstuvwxyz',
      fence,
      '',
      '| one | two |',
      '| --- | --- |',
      '| a | b |',
    ].join('\n')
    const { container } = render(<Markdown content={content} />)

    expect(container.querySelector('pre')).toHaveAttribute('tabindex', '0')
    expect(container.querySelector('pre')?.textContent).toContain('command --flag=')
    expect(container.querySelector('table')).toHaveAttribute('tabindex', '0')
    expect(container.querySelector('table')?.textContent).toContain('two')
  })
})
