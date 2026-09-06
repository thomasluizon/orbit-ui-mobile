import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Markdown } from '@/components/ui/markdown'

describe('Markdown', () => {
  it.each([
    '<a href="https://example.com">docs</a>',
    '<div><a href="http://example.com">docs</a></div>',
    '<a href="HTTPS://example.com" target="_self" rel="opener">docs</a>',
    '<a href="https://example.com" target="_blank" rel="opener">docs</a>',
    '<a href="&#104;ttps://example.com">docs</a>',
    '<a href="  https://example.com  ">docs</a>',
    '<a href="ht&#9;tps://example.com">docs</a>',
  ])('isolates raw absolute anchors after sanitization: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each([
    '<a href="/habits" target="_blank" rel="opener">habits</a>',
    '<a href="#notes" target="_blank" rel="opener">notes</a>',
    '<a href="mailto:a@b.com" target="_blank" rel="opener">mail</a>',
    '<a href="/habits" target="named-window">habits</a>',
    '<a href="javascript:alert(1)" target="_blank" rel="opener">unsafe</a>',
    '<a href="data:text/html,unsafe" target="_blank" rel="opener">unsafe</a>',
    '<a target="_blank" rel="opener">no destination</a>',
  ])('strips caller-supplied context from raw non-web anchors: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
  })

  it.each([
    'see https://useorbit.org for more',
    '[docs](https://useorbit.org/docs)',
    '[docs](http://useorbit.org/docs)',
    '[docs](HTTPS://useorbit.org/docs)',
  ])('opens absolute web links outside Orbit: %s', (content) => {
    const { container } = render(<Markdown content={content} />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['mailto:a@b.com', '/habits', '#notes'])('keeps %s in its current context', (href) => {
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

  it('strips script tags and event handlers (XSS safe)', () => {
    const { container } = render(
      <Markdown content={'<script>alert(1)</script><img src=x onerror="alert(1)">'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
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
