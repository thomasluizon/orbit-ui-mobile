import type { NormalizedHabit } from '../types/habit'
import { formatDistanceStrict } from 'date-fns/formatDistanceStrict'
import { enUS } from 'date-fns/locale/en-US'
import { ptBR } from 'date-fns/locale/pt-BR'
import { buildCommandHabitList, type CommandHabitEntry } from './command-habit-list'
import { computeHabitMatchBadges, getHabitTypeLabelKey, type HabitCardTranslationAdapter } from './habit-card-helpers'
import { formatAPIDate, nowDate, parseAPIDate } from './dates'
import { hasHabitScheduleOnDate } from './habits'
import type { SearchCommandPage } from './search-commands'

const MATCH_KEYS = {
  title: 'habits.search.matchTitle', description: 'habits.search.matchDescription',
  tag: 'habits.search.matchTag', child: 'habits.search.matchChild',
} as const

export interface SearchMatchLine {
  id: string
  label: string
  fragment: string | null
  text: string
}

export interface SearchHabitStatus {
  kind: 'done' | 'skip' | 'bad'
  label: string
}

export interface SearchSection {
  id: 'habits' | 'completed'
  headingKey: 'command.groups.search' | 'charts.bar.completed'
  entries: CommandHabitEntry[]
}

function isOneTimeTask(habit: NormalizedHabit): boolean {
  return getHabitTypeLabelKey(habit) === 'habits.form.typeTask'
}

function searchHabitState(habit: NormalizedHabit): SearchHabitStatus['kind'] | null {
  if (habit.isCompleted || habit.isLoggedInRange) return habit.isBadHabit ? 'bad' : 'done'
  if (habit.isSkippedOnDate) return 'skip'
  return null
}

function searchPriority(habit: NormalizedHabit, today: string): number {
  if (isOneTimeTask(habit) && habit.isCompleted && !habit.isBadHabit) return 5
  if (searchHabitState(habit)) return 4
  if (habit.isGeneral) return 3
  if (hasHabitScheduleOnDate(habit, today)) return 0
  return habit.dueDate < today ? 1 : 2
}

export function buildSearchEntries(
  collection: Parameters<typeof buildCommandHabitList>[0] | undefined,
  query: string,
  page: SearchCommandPage,
  today = formatAPIDate(nowDate()),
): CommandHabitEntry[] {
  if (!collection) return []
  if (query.length > 0 && page === null) return collection.topLevelHabits
    .map((habit) => ({ habit, parentTitle: null }))
    .sort((left, right) => searchPriority(left.habit, today) - searchPriority(right.habit, today))
  const entries = buildCommandHabitList(collection, query)
  return page === 'skip' ? entries.filter(({ habit }) => !habit.isGeneral) : entries
}

export function buildSearchSections(entries: readonly CommandHabitEntry[]): SearchSection[] {
  const habits: SearchSection = { id: 'habits', headingKey: 'command.groups.search', entries: [] }
  const completed: SearchSection = { id: 'completed', headingKey: 'charts.bar.completed', entries: [] }
  for (const entry of entries) {
    const section = isOneTimeTask(entry.habit) && entry.habit.isCompleted && !entry.habit.isBadHabit ? completed : habits
    section.entries.push(entry)
  }
  return [habits, completed].filter((section) => section.entries.length > 0)
}

export function buildSearchHabitStatus(
  habit: NormalizedHabit,
  translate: HabitCardTranslationAdapter,
  locale: string,
  today: string,
): SearchHabitStatus | null {
  const kind = searchHabitState(habit)
  if (kind === null) return null
  if (kind === 'skip') return { kind, label: translate('habits.statusDot.skip') }
  if (kind === 'bad') return { kind, label: translate('habits.statusDot.bad') }
  const completedOn = habit.completedOn ?? habit.instances.reduce<string | null>((latest, instance) =>
    instance.status === 'Completed' && instance.logId !== null && instance.date <= today && (latest === null || instance.date > latest)
      ? instance.date : latest, null)
  if (!completedOn) return { kind, label: translate('habits.statusDot.done') }
  const when = completedOn === today ? translate('calendar.dayCell.today') : formatDistanceStrict(
    parseAPIDate(completedOn), parseAPIDate(today), { addSuffix: true, locale: locale === 'pt-BR' ? ptBR : enUS },
  )
  return { kind, label: translate('habits.search.doneWhen', { when }) }
}

export function buildSearchMatchLines(
  query: string,
  habit: Pick<NormalizedHabit, 'searchMatches'>,
  translate: (key: string) => string,
): SearchMatchLine[] {
  return computeHabitMatchBadges(query, habit).map(({ field, value }) => {
    const label = translate(MATCH_KEYS[field])
    const fragment = value === null ? null : `“${value}”`
    return { id: JSON.stringify([field, value]), label, fragment, text: fragment === null ? label : `${label} ${fragment}` }
  })
}
