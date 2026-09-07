import { describe, expect, it } from 'vitest'
import { marked, type Tokens } from 'marked'
import { getMarkdownImageLabel, stripInlineMarkdown } from '../utils/markdown'

describe('semantic image labels', () => {
  it.each([
    ['![outer [inner][ref]](image.png)\n\n[ref]: https://example.com', 'outer inner'],
    ['![](image.png "**literal**")', '**literal**'],
  ])('preserves document context and literal titles: %s', (source, label) => {
    const paragraph = marked.lexer(source)[0] as Tokens.Paragraph
    const image = paragraph.tokens[0] as Tokens.Image
    expect(getMarkdownImageLabel(image)).toBe(label)
  })

  it.each([
    ['**bold** A &amp; B', 'bold A & B'],
    ['a \\* b', 'a * b'],
    ['&#42;literal&#42; &amp;amp; &#65; &#x1F680;', '*literal* &amp; A 🚀'],
    ['***nested*** ~~removed~~ [A &amp; B](x) ![**child**](x)', 'nested removed A & B child'],
    ['**bold** <b title="&amp;">&amp;</b>', 'bold <b title="&amp;">&</b>'],
    ['`\\* &amp;` and \\&amp;', '\\* &amp; and &amp;'],
    ['a  \nb &amp; c', 'a\nb & c'],
    ['<script>literal &amp;</script> &amp;', '<script>literal &amp;</script> &'],
  ])('flattens %s without losing literal text', (source, label) => {
    expect(getMarkdownImageLabel({ text: source, title: null, tokens: marked.Lexer.lexInline(source) })).toBe(label)
  })
})

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

  it('strips list and blockquote prefixes that carry leading indentation', () => {
    expect(stripInlineMarkdown('  - moisturizer\n\t2) toner\n   > floss nightly')).toBe(
      'moisturizer toner floss nightly',
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
