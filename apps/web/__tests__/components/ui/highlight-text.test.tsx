import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HighlightText } from '@/components/ui/highlight-text'

describe('HighlightText', () => {
  it('renders plain text when query is empty', () => {
    render(<HighlightText text="Hello World" query="" />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders plain text when no match found', () => {
    render(<HighlightText text="Hello World" query="xyz" />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
    expect(document.querySelector('mark')).not.toBeInTheDocument()
  })

  it('highlights matching text', () => {
    render(<HighlightText text="Hello World" query="World" />)
    const mark = document.querySelector('mark')
    expect(mark).toBeInTheDocument()
    expect(mark!.textContent).toBe('World')
  })

  it('highlights case-insensitively', () => {
    render(<HighlightText text="Hello World" query="hello" />)
    const mark = document.querySelector('mark')
    expect(mark).toBeInTheDocument()
    expect(mark!.textContent).toBe('Hello')
  })

  it('highlights multiple occurrences', () => {
    render(<HighlightText text="abc abc abc" query="abc" />)
    const marks = document.querySelectorAll('mark')
    expect(marks.length).toBe(3)
  })

  it('renders empty text when text is empty', () => {
    const { container } = render(<HighlightText text="" query="test" />)
    expect(container.textContent).toBe('')
  })

  it('renders text without highlight when query is whitespace', () => {
    render(<HighlightText text="Hello" query="   " />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(document.querySelector('mark')).not.toBeInTheDocument()
  })

  it('preserves non-matching segments', () => {
    render(<HighlightText text="abcXYZdef" query="XYZ" />)
    expect(document.body.textContent).toContain('abc')
    expect(document.body.textContent).toContain('XYZ')
    expect(document.body.textContent).toContain('def')
  })
})
