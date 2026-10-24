import type { SupportedLocale } from '../types/profile'
import { isWeeklyRecurrencePhrase, readHabitPhrase, segmentHabitPhrase } from './habit-phrase-parser'

export interface HabitRecurrence {
  unit: 'Day' | 'Week'
  quantity: number
  days: string[]
  flexible: boolean
  intervalWeeks: number
}

export interface HabitRecurrencePhrase {
  schedule: HabitRecurrence
  startPhrase: string | null
}

function readSchedule(phrase: string): HabitRecurrence | null {
  const schedule: HabitRecurrence = { unit: 'Week', quantity: 1, days: [], flexible: false, intervalWeeks: 1 }
  if (isWeeklyRecurrencePhrase(phrase) || /^(?:each week|cada semana|todas semanas)$/u.test(phrase)) return schedule
  if (/^(?:cada dia|a cada dia)$/u.test(phrase)) return { ...schedule, unit: 'Day' }
  if (/^(?:weekdays|every weekday|each weekday|dias uteis|todos os dias uteis)$/u.test(phrase)) {
    return { ...schedule, unit: 'Day', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] }
  }
  if (/^(?:weekends|every weekend|fins de semana|todo fim de semana)$/u.test(phrase)) {
    return { ...schedule, unit: 'Day', days: ['Saturday', 'Sunday'] }
  }
  return readParsedSchedule(phrase, 'en', schedule) ?? readParsedSchedule(phrase, 'pt-BR', schedule)
}

function readParsedSchedule(phrase: string, locale: SupportedLocale, schedule: HabitRecurrence): HabitRecurrence | null {
  const read = readHabitPhrase(phrase, locale)
  if ((!read.cadence && read.intervalWeeks === null) || read.dueTime) return null
  const remainder = segmentHabitPhrase(phrase, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join(' ')
  const connectors = read.cadence === 'fixed' ? /\b(?:every|each|on|and|toda|todo|todas|todos|as|os|e)\b/gu : /$^/gu
  if (remainder.replace(connectors, '').replace(/[\s,.!?:;]+/gu, '')) return null
  if (!read.cadence) return { ...schedule, quantity: read.intervalWeeks ?? 1 }
  return { ...schedule, unit: read.cadence === 'flexible' ? 'Week' : 'Day', quantity: read.frequencyQuantity ?? 1,
    days: read.days, flexible: read.cadence === 'flexible', intervalWeeks: read.intervalWeeks ?? 1 }
}

export function readHabitRecurrencePhrase(input: string): HabitRecurrencePhrase | null {
  const phrase = input.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/gu, ' ').replace(/^[.!?,;:]+\s*|\s*[.!?,;:]+$/gu, '')
  const parts = /^(.*?)\s+(?:from|starting(?: on)?|a partir de|a partir da|comecando(?: em)?)\s+(.+)$/u.exec(phrase)
  const schedule = readSchedule(parts?.[1] ?? phrase)
  return schedule ? { schedule, startPhrase: parts?.[2] ?? null } : null
}
