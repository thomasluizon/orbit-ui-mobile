import type { SupportedLocale } from '../types/profile'
import { readHabitPhrase } from './habit-phrase-parser'

export interface AppliedHabitPhraseFields {
  cadence: boolean
  dueTime: boolean
}

function removeOrphanedGlue(
  sentence: string,
  locale: SupportedLocale,
  characters: string[],
  removed: boolean[],
  protectedCharacters: boolean[],
): void {
  const glue = locale === 'pt-BR'
    ? /\b(?:toda|todo|todas|todos|as|os|e|por|na|no|nas|nos|a|em|cada)\b/giu
    : /\b(?:every|each|and|a|per|at|on|times?|week)\b/giu
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
      if (touchesRemoved(start - 1, -1) || touchesRemoved(end, 1)) {
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
    return token.kind === 'time' ? applied.dueTime : applied.cadence && read.cadence !== null
  })
  if (consumed.length === 0) return sentence.trim()

  const characters = sentence.split('')
  const removed = Array.from({ length: characters.length }, () => false)
  const protectedCharacters = Array.from({ length: characters.length }, () => false)
  for (const token of read.consumed) {
    if (!consumed.includes(token)) protectedCharacters.fill(true, token.start, token.end)
  }
  for (const token of consumed) {
    characters.fill(' ', token.start, token.end)
    removed.fill(true, token.start, token.end)
  }
  removeOrphanedGlue(sentence, locale, characters, removed, protectedCharacters)
  const title = characters.join('').replaceAll(/[\s,;]+/gu, ' ').trim()
  return title || sentence.trim()
}
