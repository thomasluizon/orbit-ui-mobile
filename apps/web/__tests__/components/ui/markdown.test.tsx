import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Markdown } from '@/components/ui/markdown'

describe('Markdown', () => {
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
})
