import { describe, expect, it } from 'vitest'
import { getSummaryFirstSentence } from '../utils/summary-sentence'

describe('summary sentence', () => {
  it.each([
    ['A walk is done. Reading is next.', 'A walk is done.'],
    ['Você caminhou hoje. Ainda dá para ler.', 'Você caminhou hoje.'],
    ['Você quer retomar? Vamos começar.', 'Você quer retomar?'],
    ['You finished 2.5 km. Keep going.', 'You finished 2.5 km.'],
    ['  One line without punctuation  ', 'One line without punctuation'],
    ['“Vamos retomar.” Depois, leia.', '“Vamos retomar.”'],
  ])('extracts the preview from %s', (summary, expected) => {
    expect(getSummaryFirstSentence(summary)).toBe(expected)
  })
})
