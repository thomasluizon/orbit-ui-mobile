import type { ComposerSuggestions } from '../contracts/composer'
import type { HabitDetail, NormalizedHabit } from '../types/habit'
import type { Profile } from '../types/profile'
import { getReturningInterval } from '../utils/returning-interval'

export const COMPOSER_CHIP_GAP = 8
export const COMPOSER_CHIP_PEEK = 24

export function resolveComposerStripLayout(availableWidth: number, measuredWidths: readonly number[]): { visibleWidth: number; firstChipMinWidth: number } {
  const spacing = COMPOSER_CHIP_GAP + COMPOSER_CHIP_PEEK
  const chipWidths = measuredWidths.map(width => Math.min(width, Math.max(0, availableWidth - spacing)))
  const totalWidth = chipWidths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, chipWidths.length - 1) * COMPOSER_CHIP_GAP
  if (chipWidths.some(width => width === 0) || totalWidth <= availableWidth) {
    return { visibleWidth: availableWidth, firstChipMinWidth: 0 }
  }
  const firstChipMinWidth = Math.max(0, Math.max(...chipWidths) - spacing)
  let nextStart = Math.max(chipWidths[0]!, firstChipMinWidth) + COMPOSER_CHIP_GAP
  let visibleWidth = nextStart + COMPOSER_CHIP_PEEK
  for (const width of chipWidths.slice(1, -1)) {
    nextStart += width + COMPOSER_CHIP_GAP
    if (nextStart + COMPOSER_CHIP_PEEK > availableWidth) break
    visibleWidth = nextStart + COMPOSER_CHIP_PEEK
  }
  return { visibleWidth: availableWidth, firstChipMinWidth: Math.max(chipWidths[0]!, firstChipMinWidth) + availableWidth - visibleWidth }
}

export type ComposerChipSurface = 'today' | 'calendar' | 'progress' | 'profile' | 'habitDetail'
export type ComposerChipStatus = 'loading' | 'error' | 'success'
export type ComposerChip = {
  id: string
  key: string
  params?: { title: string }
  promptKey?: string
  label?: string
  prompt?: string
}

type ChipHabit = Pick<NormalizedHabit, 'title' | 'isCompleted' | 'isOverdue' | 'hasSubHabits' | 'linkedGoals'>
type ChipProfile = Pick<Profile, 'aiSummaryEnabled' | 'hasGoogleConnection' | 'currentStreak' | 'longestStreak' | 'lastCompletionDate' | 'timeZone'>
type DetailHabit = Pick<HabitDetail, 'title' | 'checklistItems'>

export type ComposerChipState = {
  surface: ComposerChipSurface
  status: ComposerChipStatus
  habits: readonly ChipHabit[]
  totalHabitCount: number | null
  selectedDateIsToday?: boolean
  profile: ChipProfile | null
  detailHabit?: DetailHabit | null
  contextualSuggestion?: { id: string; label: string; prompt: string } | null
  now?: Date
}

const chip = (id: string, params?: { title: string }): ComposerChip => ({
  id,
  key: `shell.composer.chips.${id}`,
  ...(params ? { params, promptKey: `shell.composer.prompts.${id}` } : {}),
})

export function resolveComposerChipStatus(surface: ComposerChipSurface, state: {
  habitsError: boolean
  habitsReady: boolean
  detailError: boolean
  detailReady: boolean
  calendarError: boolean
}): ComposerChipStatus {
  if (surface === 'calendar') return state.calendarError ? 'error' : 'success'
  if (surface === 'habitDetail') {
    if (state.detailError) return 'error'
    return state.detailReady ? 'success' : 'loading'
  }
  if (state.habitsError) return 'error'
  return state.habitsReady ? 'success' : 'loading'
}

function todayChips(state: ComposerChipState): ComposerChip[] {
  if (state.status !== 'success' || !state.profile || state.totalHabitCount === null) return []
  const { habits, profile } = state
  if (state.totalHabitCount === 0) {
    return [chip('today.buildMorningRoutine'), chip('today.startOneHabit'), chip('today.suggestThreeHabits'), chip('today.createEveningHabit')]
  }
  const returning = (state.selectedDateIsToday ?? true)
    ? getReturningInterval(profile.lastCompletionDate, profile.timeZone, state.now)
    : null
  if (returning) {
    const firstHabit = habits[0]
    return [
      chip('today.logLastDays'), chip('today.resumeHabits'), chip('today.cutToTwo'),
      chip('today.changeTimes'), chip('today.pauseWhatDoesNotFit'),
      ...(firstHabit ? [chip('today.keepOnlyHabit', { title: firstHabit.title })] : []),
    ]
  }
  const pending = habits.find((habit) => !habit.isCompleted && !habit.isOverdue)
    ?? habits.find((habit) => !habit.isCompleted)
  if (!pending) {
    const parent = habits.find((habit) => habit.hasSubHabits)
    return [chip('today.logYesterday'), chip('today.createEveningHabit'), chip('today.changeTimes'), ...(parent ? [chip('today.reviewHabit', { title: parent.title })] : [])]
  }
  const overdue = habits.find((habit) => habit.isOverdue && !habit.isCompleted)
  const parent = habits.find((habit) => habit.hasSubHabits && !habit.isCompleted)
  const log = chip('today.logHabit', { title: pending.title })
  const candidates = [
    ...((state.selectedDateIsToday ?? true) && profile.currentStreak > 0 && habits.every((habit) => !habit.isCompleted) ? [log] : []),
    ...(overdue ? [chip('today.moveOverdue', { title: overdue.title })] : []),
    ...((state.selectedDateIsToday ?? true) && profile.currentStreak > 0 && habits.every((habit) => !habit.isCompleted) ? [] : [log]),
    chip('today.logYesterday'),
    chip('today.pushTomorrow'),
    ...(parent ? [chip('today.trimHabit', { title: parent.title })] : []),
    chip('today.createMorningHabit'),
  ]
  return candidates
}

function progressChips(state: ComposerChipState): ComposerChip[] {
  if (!state.profile) return []
  const contextual = state.contextualSuggestion
  const requested: ComposerChip[] = contextual?.id === 'progress-create-goal' ? [{
    id: contextual.id, key: 'progressScreen.goals.createAction',
    label: contextual.label, prompt: contextual.prompt,
  }] : []
  if (state.status !== 'success') return requested
  const noGoal = state.habits.find((habit) => !habit.linkedGoals?.length)
  const withGoal = state.habits.some((habit) => Boolean(habit.linkedGoals?.length))
  const candidates = [
    ...(noGoal ? [chip('progress.createGoal', { title: noGoal.title })] : []),
    ...(state.profile.currentStreak === 0 && state.profile.longestStreak > 0 ? [chip('progress.brokenStreak')] : []),
    ...(withGoal ? [chip('progress.trimGoals')] : []),
    chip('progress.stuckThisWeek'),
  ]
  if (candidates.length < 3) candidates.push(chip('today.logYesterday'))
  if (candidates.length < 3) candidates.push(chip('today.createMorningHabit'))
  return requested.length ? [...requested, ...candidates.slice(0, 3)] : candidates
}

export function buildComposerChips(state: ComposerChipState): ComposerChip[] {
  if (!state.profile) return []
  switch (state.surface) {
    case 'today': return todayChips(state)
    case 'calendar': return state.status === 'error' ? [] : [
      chip('today.logYesterday'), chip('calendar.slippedThisWeek'), chip('today.changeTimes'),
      ...(state.profile.hasGoogleConnection ? [chip('calendar.syncCalendar')] : []),
    ]
    case 'progress': return progressChips(state)
    case 'profile': return [
      chip('profile.changeTimezone'),
      ...(state.profile.aiSummaryEnabled ? [chip('profile.turnOffSummary')] : []),
      chip('profile.seePlan'), chip('profile.exportData'),
    ]
    case 'habitDetail': {
      if (state.status !== 'success' || !state.detailHabit) return []
      return [
        chip('habitDetail.pauseThisWeek', { title: state.detailHabit.title }), chip('habitDetail.rename', { title: state.detailHabit.title }),
      ]
    }
  }
}

export function resolveComposerChipSurface(pathname: string): ComposerChipSurface {
  if (pathname.startsWith('/habits/') && pathname !== '/habits/new') return 'habitDetail'
  if (pathname === '/calendar') return 'calendar'
  if (pathname === '/progress') return 'progress'
  if (pathname === '/profile') return 'profile'
  return 'today'
}

export function resolveComposerDockSuggestions(pathname: string, suggestions: ComposerSuggestions): ComposerSuggestions {
  return pathname === '/' ? [] : suggestions
}
