import type { SupportedLocale } from '../types/profile'
import { habitPhraseFormRepeats, readHabitPhrase, type HabitPhraseSpan } from './habit-phrase-parser'

export interface AppliedHabitPhraseFields {
  cadence: boolean
  dueTime: boolean
  /** The words of a date that the item holds from the phrase. */
  date?: HabitPhraseSpan | null
}

function trimTitleSeparators(title: string): string {
  let start = 0
  let end = title.length
  while (start < end && /[,;\s]/u.test(title[start]!)) start += 1
  while (end > start && /[,;\s]/u.test(title[end - 1]!)) end -= 1
  return title.slice(start, end)
}

const NOT_A_WORD_BEFORE = String.raw`(?<![\p{L}\p{M}\p{N}_])`
const NOT_A_WORD_AFTER = String.raw`(?![\p{L}\p{M}\p{N}_])`
const GLUE_WORDS: Record<SupportedLocale, string> = {
  'pt-BR': 'toda|todo|todas|todos|as|os|e|por|na|no|nas|nos|a|em|cada|de|da|das|do|dos|às|ás|aos',
  en: 'every|each|and|a|per|at|on|from|times?|week',
}
const GLUE = Object.fromEntries(Object.entries(GLUE_WORDS).map(([locale, words]) => [
  locale, new RegExp(`${NOT_A_WORD_BEFORE}(?:${words})${NOT_A_WORD_AFTER}`, 'giu'),
])) as Record<SupportedLocale, RegExp>
const DAY_SUFFIX_WORD = new RegExp(`${NOT_A_WORD_BEFORE}feiras?${NOT_A_WORD_AFTER}`, 'giu')

interface TitleText {
  characters: string[]
  removed: boolean[]
  protectedCharacters: boolean[]
}

function touchesRemoved({ characters, removed }: TitleText, start: number, direction: -1 | 1): boolean {
  for (let index = start; index >= 0 && index < characters.length; index += direction) {
    if (removed[index]) return true
    if (!/[\s,;]/u.test(characters[index]!)) return false
  }
  return false
}

function removeSpan({ characters, removed }: TitleText, start: number, end: number): true {
  characters.fill(' ', start, end)
  removed.fill(true, start, end)
  return true
}

function isSpanOpen({ removed, protectedCharacters }: TitleText, start: number, end: number): boolean {
  return !protectedCharacters.slice(start, end).some(Boolean) && !removed.slice(start, end).every(Boolean)
}

function removeJoiningSeparator(text: TitleText, index: number): boolean {
  const joinsRemoved = touchesRemoved(text, index - 1, -1) && touchesRemoved(text, index + 1, 1)
  return joinsRemoved && isSpanOpen(text, index, index + 1) && removeSpan(text, index, index + 1)
}

function removeOrphanedWord(text: TitleText, start: number, end: number): boolean {
  if (!isSpanOpen(text, start, end)) return false
  const trailing = text.characters.slice(end).every((character) => /[\s,;]/u.test(character))
  const orphaned = touchesRemoved(text, end, 1) || (trailing && touchesRemoved(text, start - 1, -1))
  return orphaned && removeSpan(text, start, end)
}

function removeDaySuffixWord(text: TitleText, start: number, end: number): boolean {
  return isSpanOpen(text, start, end) && touchesRemoved(text, start - 1, -1) && removeSpan(text, start, end)
}

function removeOrphanedGlue(sentence: string, locale: SupportedLocale, text: TitleText): void {
  const words = [...sentence.matchAll(GLUE[locale])]
  const daySuffixes = locale === 'pt-BR' ? [...sentence.matchAll(DAY_SUFFIX_WORD)] : []
  const separators = [...sentence.matchAll(/[,;\-\u2013\u2014/&+]/gu)]
  let changed = true
  while (changed) {
    const separatorsRemoved = separators.map((match) => removeJoiningSeparator(text, match.index))
    const wordsRemoved = words.map((match) => removeOrphanedWord(text, match.index, match.index + match[0].length))
    const suffixesRemoved = daySuffixes.map((match) => removeDaySuffixWord(text, match.index, match.index + match[0].length))
    changed = [...separatorsRemoved, ...wordsRemoved, ...suffixesRemoved].some(Boolean)
  }
}

function removeTrailingStop(text: TitleText): void {
  const { characters } = text
  let first = characters.length
  while (first > 0 && /[\s,;.!?]/u.test(characters[first - 1]!)) first -= 1
  while (first < characters.length && !/[.!?]/u.test(characters[first]!)) first += 1
  if (first === characters.length || !touchesRemoved(text, first - 1, -1)) return
  if (!isSpanOpen(text, first, characters.length)) return
  removeSpan(text, first, characters.length)
}

export function getHabitPhraseTitle(
  sentence: string,
  locale: SupportedLocale,
  applied?: AppliedHabitPhraseFields,
  readsBareInterval = false,
): string {
  const read = readHabitPhrase(sentence, locale)
  const consumed = read.consumed.filter((token) => {
    if (!applied) return true
    return token.kind === 'time' ? applied.dueTime : applied.cadence && habitPhraseFormRepeats(read, readsBareInterval)
  })
  const date = applied?.date ?? null
  if (consumed.length === 0 && date === null) return sentence.trim()

  const characters = sentence.split('')
  const removed = Array.from({ length: characters.length }, () => false)
  const protectedCharacters = Array.from({ length: characters.length }, () => false)
  for (const token of read.consumed) {
    if (!consumed.includes(token)) protectedCharacters.fill(true, token.start, token.end)
  }
  for (const span of date ? [...consumed, date] : consumed) {
    characters.fill(' ', span.start, span.end)
    removed.fill(true, span.start, span.end)
  }
  const text = { characters, removed, protectedCharacters }
  if (date !== null || consumed.some((token) => token.kind !== 'time')) {
    removeOrphanedGlue(sentence, locale, text)
  }
  removeTrailingStop(text)
  const title = trimTitleSeparators(characters.join('').replaceAll(/\s+/gu, ' '))
  return title || sentence.trim()
}
