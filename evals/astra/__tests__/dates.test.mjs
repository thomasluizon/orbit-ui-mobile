import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = configuration.tests.flatMap((file) =>
  parse(readFileSync(new URL(`../${file.replace('file://', '')}`, import.meta.url), 'utf8')))
const months = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|fev|abr|mai|ago|set|out|dez'
const fixedDate = new RegExp(`\\b\\d{1,2}/\\d{1,2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b(?:${months})\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+|de\\s+)?(?:${months})\\b`, 'iu')
const hasFixedDate = (input) => fixedDate.test(input.replace(/\{[^{}]+\}/g, ''))

it.each(['On 10/26', 'dia 26/10', '2031-01-02', 'October 26', '26 October',
  '26th of October', '26 de outubro', 'outubro 26', 'Oct. 26', '26 out.'])(
  'detects the fixed date in %s', (input) => expect(hasFixedDate(input)).toBe(true),
)
it.each(['On {accountDateEn+3}', 'dia {accountDatePtBR+7}', '{accountDate+3}',
  '3 days before at 13:30', 'May I create a habit?'])(
  'allows relative dates and ordinary text in %s', (input) => expect(hasFixedDate(input)).toBe(false),
)
it.each(corpus)('uses date placeholders in input and setup.input for $metadata.id', ({ vars }) => {
  for (const input of [vars.input, vars.setup?.input].filter((input) => typeof input === 'string')) {
    expect(hasFixedDate(input), input).toBe(false)
  }
})
