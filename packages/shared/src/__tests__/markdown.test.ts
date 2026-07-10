import { describe, expect, it } from 'vitest'
import { stripInlineMarkdown } from '../utils/markdown'

describe('stripInlineMarkdown', () => {
  it('strips bold and italic markers but keeps the text', () => {
    expect(stripInlineMarkdown('**Effaclar Alta Tolerância** every _night_')).toBe(
      'Effaclar Alta Tolerância every night',
    )
  })

  it('strips ordered and unordered list prefixes', () => {
    expect(stripInlineMarkdown('1. **Effaclar** cleanser\n- moisturizer\n* sunscreen')).toBe(
      'Effaclar cleanser moisturizer sunscreen',
    )
  })

  it('strips heading and blockquote prefixes', () => {
    expect(stripInlineMarkdown('## Routine\n> remember to floss')).toBe(
      'Routine remember to floss',
    )
  })

  it('keeps link and image labels without the urls', () => {
    expect(
      stripInlineMarkdown('see [the guide](https://example.com) and ![chart](https://example.com/c.png)'),
    ).toBe('see the guide and chart')
  })

  it('strips inline code backticks', () => {
    expect(stripInlineMarkdown('run `npm test` daily')).toBe('run npm test daily')
  })

  it('collapses newlines and repeated whitespace into single spaces', () => {
    expect(stripInlineMarkdown('first line\n\nsecond   line')).toBe('first line second line')
  })

  it('returns plain text unchanged', () => {
    expect(stripInlineMarkdown('just a plain description')).toBe('just a plain description')
  })

  it('runs in linear time on adversarial nested markers (ReDoS regression, ui#10)', () => {
    const adversarial = '!['.repeat(200_000) + '![]('.repeat(200_000)
    const start = performance.now()
    const result = stripInlineMarkdown(adversarial)
    const elapsed = performance.now() - start
    expect(typeof result).toBe('string')
    expect(elapsed).toBeLessThan(2000)
  })
})
