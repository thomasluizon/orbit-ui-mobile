import type { SupportedLocale } from '../types/profile'
import { habitPhraseRepeats, readHabitPhrase, type HabitPhraseSpan } from './habit-phrase-parser'

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

function removeOrphanedGlue(
  sentence: string,
  locale: SupportedLocale,
  characters: string[],
  removed: boolean[],
  protectedCharacters: boolean[],
): void {
  const glue = locale === 'pt-BR'
    ? /(?<![\p{L}\p{M}\p{N}_])(?:toda|todo|todas|todos|as|os|e|por|na|no|nas|nos|a|em|cada)(?![\p{L}\p{M}\p{N}_])/giu
    : /(?<![\p{L}\p{M}\p{N}_])(?:every|each|and|a|per|at|on|times?|week)(?![\p{L}\p{M}\p{N}_])/giu
  const removable = [...sentence.matchAll(glue)]
  const touchesRemoved = (start: number, direction: -1 | 1): boolean => {
    for (let index = start; index >= 0 && index < characters.length; index += direction) {
      if (removed[index]) return true
      if (!/[\s,;]/u.test(characters[index]!)) return false
    }
    return false
  }
  let changed = true
  while (changed) {
    changed = false
    for (const match of removable) {
      const start = match.index
      const end = start + match[0].length
      if (protectedCharacters.slice(start, end).some(Boolean)) continue
      if (removed.slice(start, end).every(Boolean)) continue
      const trailing = characters.slice(end).every((character) => /[\s,;]/u.test(character))
      if (touchesRemoved(end, 1) || (trailing && touchesRemoved(start - 1, -1))) {
        characters.fill(' ', start, end)
        removed.fill(true, start, end)
        changed = true
      }
    }
  }
}

export function getHabitPhraseTitle(
  sentence: string,
  locale: SupportedLocale,
  applied?: AppliedHabitPhraseFields,
): string {
  const read = readHabitPhrase(sentence, locale)
  const consumed = read.consumed.filter((token) => {
    if (!applied) return true
    return token.kind === 'time' ? applied.dueTime : applied.cadence && habitPhraseRepeats(read)
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
  if (date !== null || consumed.some((token) => token.kind !== 'time')) {
    removeOrphanedGlue(sentence, locale, characters, removed, protectedCharacters)
  }
  const title = trimTitleSeparators(characters.join('').replaceAll(/\s+/gu, ' '))
  return title || sentence.trim()
}
