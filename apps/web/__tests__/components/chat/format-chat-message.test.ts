import { describe, it, expect } from 'vitest'
import { formatChatMessage } from '@/components/chat/format-chat-message'

describe('formatChatMessage', () => {
  it('escapes HTML entities to prevent XSS', () => {
    expect(formatChatMessage('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    )
  })

  it('escapes ampersands', () => {
    expect(formatChatMessage('A & B')).toBe('A &amp; B')
  })

  it('converts **bold** to <strong>', () => {
    expect(formatChatMessage('This is **bold** text')).toBe(
      'This is <strong>bold</strong> text',
    )
  })

  it('converts *italic* to <em>', () => {
    expect(formatChatMessage('This is *italic* text')).toBe(
      'This is <em>italic</em> text',
    )
  })

  it('handles bold and italic together', () => {
    expect(formatChatMessage('**bold** and *italic*')).toBe(
      '<strong>bold</strong> and <em>italic</em>',
    )
  })

  it('does not convert bullet asterisks to italic', () => {
    const input = '* item one\n* item two'
    const result = formatChatMessage(input)
    expect(result).not.toContain('<em>')
  })

  it('returns empty string for empty input', () => {
    expect(formatChatMessage('')).toBe('')
  })

  it('handles text with no formatting', () => {
    expect(formatChatMessage('plain text')).toBe('plain text')
  })

  it('handles multiple bold sections', () => {
    expect(formatChatMessage('**a** and **b**')).toBe(
      '<strong>a</strong> and <strong>b</strong>',
    )
  })
})
