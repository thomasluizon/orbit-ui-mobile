import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { marked, type Tokens } from 'marked'
import { getMarkdownImageLabel, stripInlineMarkdown } from '../utils/markdown'
import { splitDescriptionLinks } from '../utils/description-links'

describe('plain description links', () => {
  it.each([
    '  **Original**\n\nhttps://example.com/a?b=c&d=e\n',
    '(https://example.com/a_(b)). [http://example.org/path], HTTPS://example.net/',
    'https://例え.jp/道 and https://example.com/' + 'long'.repeat(100),
  ])('preserves every source character in %s', (source) => {
    const parts = splitDescriptionLinks(source)
    expect(parts.map(({ text }) => text).join('')).toBe(source)
    expect(parts.filter(({ href }) => href).length).toBeGreaterThan(0)
    for (const part of parts) expect(source.slice(part.offset, part.offset + part.text.length)).toBe(part.text)
  })

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'orbit://habit', 'mailto:person@example.com', '//example.com', 'https:///example.com', 'https://', 'https://bad%20host', 'https://example.com:wrong', 'javascript:https://example.com', 'https://example.com\\path', 'https://example.com/%zz'])('leaves %s inert', (source) => {
    expect(splitDescriptionLinks(source)).toEqual([{ text: source, offset: 0 }])
  })

  it('rejects the encoded host accepted by the recorded Chromium constructor', () => {
    const RuntimeURL = globalThis.URL
    const malformed = 'https://bad%20host'
    vi.stubGlobal('URL', class extends RuntimeURL {
      constructor(input: string) {
        super(input === malformed ? 'https://example.invalid/' : input)
        if (input === malformed) Object.defineProperties(this, {
          hostname: { value: 'bad%20host' },
          href: { value: 'https://bad%20host/' },
        })
      }
    })
    try {
      const safe = 'https://example.com/a%20b?q=%23value'
      const source = `(${malformed}).\n(${safe}).`
      const parts = splitDescriptionLinks(source)
      expect(parts.map(({ text }) => text).join('')).toBe(source)
      expect(parts.filter(({ href }) => href)).toEqual([{ text: safe, href: safe, offset: source.indexOf(safe) }])
      for (const part of parts) expect(source.slice(part.offset, part.offset + part.text.length)).toBe(part.text)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    'https://example.com/a%20b?q=%23value&next=%2Fpath',
    'https://%65xample.com/a%25b',
    'https://例え.jp/道?q=%E9%81%93',
    'https://%E4%BE%8B%E3%81%88.jp/%E9%81%93',
    'http://[::1]/a%20b',
  ])('links %s without changing its source or offsets', (destination) => {
    const source = `See (${destination}).\n`
    const parts = splitDescriptionLinks(source)
    expect(parts.filter(({ href }) => href)).toEqual([{ text: destination, href: destination, offset: 5 }])
    expect(parts.map(({ text }) => text).join('')).toBe(source)
    for (const part of parts) expect(source.slice(part.offset, part.offset + part.text.length)).toBe(part.text)
  })

  it('keeps balanced URL parentheses while excluding sentence punctuation', () => {
    expect(splitDescriptionLinks('(https://example.com/a_(b)).').filter(({ href }) => href)).toEqual([{ text: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)', offset: 1 }])
  })

  it.each([
    [`https://example.com/${'!'.repeat(5_000)}x`, `https://example.com/${'!'.repeat(5_000)}x`],
    [`https://example.com/a${')'.repeat(5_000)}`, 'https://example.com/a'],
    ['https://example.com/(a)[b]{c}', 'https://example.com/(a)[b]{c}'],
    ['https://example.com/a)]}', 'https://example.com/a)]'],
    ['https://example.com/a)]', 'https://example.com/a)'],
    ['https://example.com/a))!!', 'https://example.com/a'],
  ])('preserves adversarial and ordered bracket source %s', (token, destination) => {
    const source = `Before ${token}\nAfter https://example.org/safe.`
    const parts = splitDescriptionLinks(source)
    expect(parts.map(({ text }) => text).join('')).toBe(source)
    expect(parts.filter(({ href }) => href)).toEqual([
      { text: destination, href: destination, offset: 7 },
      { text: 'https://example.org/safe', href: 'https://example.org/safe', offset: source.indexOf('https://example.org/safe') },
    ])
    for (const part of parts) expect(source.slice(part.offset, part.offset + part.text.length)).toBe(part.text)
  })

  it('bounds adversarial exported parser work across three isolated runs', () => {
    const source = readFileSync(new URL('../utils/description-links.ts', import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    const probe = `${compiled}\nconst source = 'https://example.com/' + '!'.repeat(160_000) + 'x https://example.org/a' + ')'.repeat(40_000); const parts = splitDescriptionLinks(source); if (parts.map(part => part.text).join('') !== source || parts.filter(part => part.href).length !== 2 || parts.some(part => source.slice(part.offset, part.offset + part.text.length) !== part.text)) process.exit(1); process.stdout.write('ok');`
    const runs = Array.from({ length: 3 }, () => {
      const start = performance.now()
      const result = spawnSync(process.execPath, ['--input-type=module'], { input: probe, encoding: 'utf8', timeout: 3_000, killSignal: 'SIGKILL' })
      return { milliseconds: performance.now() - start, status: result.status, output: result.stdout, error: result.error?.message }
    })
    const median = runs.map(({ milliseconds }) => milliseconds).sort((left, right) => left - right)[1]!
    expect(runs.map(({ status, output }) => ({ status, output })), JSON.stringify(runs)).toEqual(Array.from({ length: 3 }, () => ({ status: 0, output: 'ok' })))
    expect(median, JSON.stringify(runs)).toBeLessThan(2_500)
  })

  it.each(["javascript:alert('https://example.com')", 'data:text/plain,(https://example.com)', 'orbit:open(https://example.com)'])('does not activate an HTTP substring inside %s', (source) => {
    expect(splitDescriptionLinks(source)).toEqual([{ text: source, offset: 0 }])
  })
})

describe('semantic image labels', () => {
  it.each([
    ['![outer ![](inner.png "inner title") after](outer.png)', 'outer inner title after'],
    ['![![](inner.png)](outer.png "outer title")', 'outer title'],
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
