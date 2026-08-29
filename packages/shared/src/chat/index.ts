import type { CalendarMonthResponse, HabitScheduleItem } from '../types/habit'
import type { Goal } from '../types/goal'
import type { Profile } from '../types/profile'
import { buildCalendarDayMap } from '../utils/habits'

export * from './related-surfaces'
export * from './sse-stream'

export const CHAT_VISUALIZER_BAR_OFFSETS = [0, 0.08, 0.16, 0.04, 0.12, 0.2, 0.06, 0.14, 0.22] as const

export const CHAT_STARTER_CHIP_KEYS = [
  'chat.starterChips.logHabit',
  'chat.starterChips.createRoutine',
  'chat.starterChips.howAmIDoing',
  'chat.starterChips.planWeek',
] as const

export type ChatSuggestionDestination = 'hoje' | 'calendario' | 'progresso' | 'perfil'

export type LiveChatSuggestion = {
  id: string
  key: string
  values?: Record<string, string | number>
}

export interface LiveChatSuggestionState {
  destination: ChatSuggestionDestination
  habits?: readonly HabitScheduleItem[]
  calendar?: CalendarMonthResponse
  goals?: readonly Goal[]
  profile: Pick<
    Profile,
    | 'aiSummaryEnabled'
    | 'currentStreak'
    | 'hasGoogleConnection'
    | 'proactiveAstraEnabled'
  >
}

type LiveChatSuggestions = readonly [LiveChatSuggestion, LiveChatSuggestion, LiveChatSuggestion]

function suggestion(
  id: string,
  key: string,
  values?: Record<string, string | number>,
): LiveChatSuggestion {
  return values ? { id, key, values } : { id, key }
}

function deriveTodayRemainingSuggestion(
  openHabitCount: number,
  hasGoogleConnection: boolean,
): LiveChatSuggestion {
  if (openHabitCount === 1) {
    return suggestion('today-one-remaining', 'shell.composer.live.today.oneRemaining')
  }
  if (openHabitCount > 1) {
    return suggestion('today-remaining', 'shell.composer.live.today.remaining', {
      count: openHabitCount,
    })
  }
  return hasGoogleConnection
    ? suggestion('today-calendar', 'shell.composer.live.profile.reviewCalendar')
    : suggestion('today-calendar', 'shell.composer.live.profile.explainCalendar')
}

function deriveTodaySuggestions(state: LiveChatSuggestionState): LiveChatSuggestions {
  const habits = state.habits ?? []
  const openHabits = habits.filter((habit) => !habit.isCompleted)
  const priorityHabit = openHabits.find((habit) => habit.isOverdue) ?? openHabits[0]
  const unlinkedHabit = habits.find((habit) => habit.linkedGoals.length === 0)
  const linkedHabit = habits.find((habit) => habit.linkedGoals.length > 0)

  const priority = priorityHabit
    ? suggestion(
        `today-priority-${priorityHabit.id}`,
        priorityHabit.isOverdue
          ? 'shell.composer.live.today.catchUp'
          : 'shell.composer.live.today.start',
        { habit: priorityHabit.title },
      )
    : habits.length > 0
      ? suggestion('today-all-done', 'shell.composer.live.today.reviewCompleted')
      : suggestion('today-first-habit', 'shell.composer.live.today.firstHabit')

  const goal = unlinkedHabit
    ? suggestion('today-link-goal', 'shell.composer.live.today.linkGoal', {
        habit: unlinkedHabit.title,
      })
    : linkedHabit
      ? suggestion('today-review-goal', 'shell.composer.live.today.reviewGoal', {
          habit: linkedHabit.title,
        })
      : state.profile.currentStreak > 0
        ? suggestion('today-protect-streak', 'shell.composer.live.progress.protectStreak', {
            count: state.profile.currentStreak,
          })
        : suggestion('today-plan-routine', 'shell.composer.live.today.planRoutine')

  const remaining = deriveTodayRemainingSuggestion(
    openHabits.length,
    state.profile.hasGoogleConnection,
  )

  return [priority, goal, remaining]
}

function deriveCalendarSuggestions(state: LiveChatSuggestionState): LiveChatSuggestions {
  const entries = state.calendar
    ? Array.from(buildCalendarDayMap(state.calendar).values()).flat()
    : []
  const missed = entries.find((entry) => entry.status === 'missed')
  const upcoming = entries.find((entry) => entry.status === 'upcoming')
  const completed = entries.find((entry) => entry.status === 'completed')

  const recovery = missed
    ? suggestion(`calendar-missed-${missed.habitId}`, 'shell.composer.live.calendar.reschedule', {
        habit: missed.title,
      })
    : entries.length > 0
      ? suggestion('calendar-review-month', 'shell.composer.live.calendar.reviewMonth')
      : suggestion('calendar-plan-empty', 'shell.composer.live.calendar.planEmpty')

  const timing = upcoming
    ? suggestion(`calendar-upcoming-${upcoming.habitId}`, 'shell.composer.live.calendar.planAround', {
        habit: upcoming.title,
      })
    : completed
      ? suggestion(`calendar-completed-${completed.habitId}`, 'shell.composer.live.calendar.reviewTiming', {
          habit: completed.title,
        })
      : state.profile.hasGoogleConnection
        ? suggestion('calendar-sync', 'shell.composer.live.profile.reviewCalendar')
        : suggestion('calendar-sync', 'shell.composer.live.profile.explainCalendar')

  const schedule = entries.length === 1
    ? suggestion('calendar-one-entry', 'shell.composer.live.calendar.oneScheduled')
    : entries.length > 1
      ? suggestion('calendar-entries', 'shell.composer.live.calendar.scheduled', {
          count: entries.length,
        })
      : suggestion('calendar-first-entry', 'shell.composer.live.calendar.firstSchedule')

  return [recovery, timing, schedule]
}

function deriveProgressSuggestions(state: LiveChatSuggestionState): LiveChatSuggestions {
  const goals = state.goals ?? []
  const activeGoals = goals.filter((goal) => goal.status === 'Active')
  const unlinkedGoal = activeGoals.find((goal) => goal.linkedHabits.length === 0)
  const nextGoal = activeGoals[0]

  const goal = unlinkedGoal
    ? suggestion(`progress-link-${unlinkedGoal.id}`, 'shell.composer.live.progress.linkHabits', {
        goal: unlinkedGoal.title,
      })
    : nextGoal
      ? suggestion(`progress-advance-${nextGoal.id}`, 'shell.composer.live.progress.advanceGoal', {
          goal: nextGoal.title,
        })
      : suggestion('progress-first-goal', 'shell.composer.live.progress.firstGoal')

  const streak = state.profile.currentStreak > 0
    ? suggestion('progress-streak', 'shell.composer.live.progress.protectStreak', {
        count: state.profile.currentStreak,
      })
    : suggestion('progress-restart', 'shell.composer.live.progress.restartStreak')

  const summary = activeGoals.length === 1
    ? suggestion('progress-one-goal', 'shell.composer.live.progress.reviewOneGoal')
    : activeGoals.length > 1
      ? suggestion('progress-goals', 'shell.composer.live.progress.reviewGoals', {
          count: activeGoals.length,
        })
      : suggestion(
          'progress-summary',
          state.profile.aiSummaryEnabled
            ? 'shell.composer.live.profile.pauseSummary'
            : 'shell.composer.live.profile.enableSummary',
        )

  return [goal, streak, summary]
}

function deriveProfileSuggestions(state: LiveChatSuggestionState): LiveChatSuggestions {
  return [
    suggestion(
      'profile-proactive',
      state.profile.proactiveAstraEnabled
        ? 'shell.composer.live.profile.pauseProactive'
        : 'shell.composer.live.profile.enableProactive',
    ),
    suggestion(
      'profile-calendar',
      state.profile.hasGoogleConnection
        ? 'shell.composer.live.profile.reviewCalendar'
        : 'shell.composer.live.profile.explainCalendar',
    ),
    suggestion(
      'profile-summary',
      state.profile.aiSummaryEnabled
        ? 'shell.composer.live.profile.pauseSummary'
        : 'shell.composer.live.profile.enableSummary',
    ),
  ]
}

export function deriveLiveChatSuggestions(
  state: LiveChatSuggestionState,
): LiveChatSuggestions {
  if (state.destination === 'hoje') return deriveTodaySuggestions(state)
  if (state.destination === 'calendario') return deriveCalendarSuggestions(state)
  if (state.destination === 'progresso') return deriveProgressSuggestions(state)
  return deriveProfileSuggestions(state)
}

/**
 * Maximum silence between chat stream events before the client aborts the send
 * and offers retry. Tool rounds emit keepalive `round` events, so a healthy
 * request never goes quiet this long.
 */
export const CHAT_STREAM_IDLE_TIMEOUT_MS = 60_000

/**
 * Voice-input auto-stop tuning shared by both platforms. Recording stops on its
 * own after {@link VOICE_SILENCE_TIMEOUT_MS} of continuous silence, but only
 * once speech has been heard, so an early pause before the user starts talking
 * never cuts the recording short. Levels are sampled every
 * {@link VOICE_LEVEL_POLL_MS}. Both platforms compare a linear time-domain RMS
 * amplitude (0..1): web via a Web Audio `AnalyserNode`, mobile via
 * `@siteed/audio-studio`'s `onAudioAnalysis` data points (expo-audio metering is
 * unusable on Android — it breaks `record()` — see
 * https://github.com/expo/expo/issues/37241). The thresholds are kept per-platform
 * so each can be tuned independently if the mic RMS scales differently.
 */
export const VOICE_SILENCE_TIMEOUT_MS = 2000
export const VOICE_LEVEL_POLL_MS = 150
export const VOICE_WEB_SPEECH_RMS_THRESHOLD = 0.025
export const VOICE_MOBILE_SPEECH_RMS_THRESHOLD = 0.025

const MAX_CHAT_IMAGE_SIZE_BYTES = 20 * 1024 * 1024

const CHAT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

type ChatImageValidationError = 'type' | 'size'

interface ChatImageCandidate {
  mimeType?: string | null
  fileSize?: number | null
  name?: string | null
  uri?: string | null
}

function inferChatImageMimeType(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.webp')) return 'image/webp'
  return null
}

export function resolveChatImageMimeType(candidate: ChatImageCandidate): string | null {
  const normalizedMimeType = candidate.mimeType?.trim().toLowerCase()
  if (normalizedMimeType) return normalizedMimeType

  return inferChatImageMimeType(candidate.name) ?? inferChatImageMimeType(candidate.uri)
}

export function getChatImageValidationError(
  candidate: ChatImageCandidate,
): ChatImageValidationError | null {
  const mimeType = resolveChatImageMimeType(candidate)
  if (!mimeType || !CHAT_IMAGE_MIME_TYPES.includes(mimeType as (typeof CHAT_IMAGE_MIME_TYPES)[number])) {
    return 'type'
  }

  if (typeof candidate.fileSize === 'number' && candidate.fileSize > MAX_CHAT_IMAGE_SIZE_BYTES) {
    return 'size'
  }

  return null
}

const COMPLETE_CHAT_DIRECTIVE = /\[\[orbit:[a-z:]+\]\]/gi

const CHAT_DIRECTIVE_OPEN = '[[orbit:'

function isChatDirectivePrefix(candidate: string): boolean {
  const normalized = candidate.toLowerCase()
  if (CHAT_DIRECTIVE_OPEN.startsWith(normalized)) return true
  if (!normalized.startsWith(CHAT_DIRECTIVE_OPEN)) return false

  const body = normalized.slice(CHAT_DIRECTIVE_OPEN.length)
  const closingBracket = body.indexOf(']')
  const directiveBody = closingBracket === -1 ? body : body.slice(0, closingBracket)
  if (closingBracket !== -1 && closingBracket !== body.length - 1) return false

  return [...directiveBody].every((character) =>
    character === ':' || (character >= 'a' && character <= 'z'),
  )
}

function stripTrailingChatDirectivePrefix(content: string): string {
  const withoutTrailingWhitespace = content.trimEnd()
  const directiveStart = withoutTrailingWhitespace.lastIndexOf('[[')
  if (directiveStart >= 0) {
    const candidate = withoutTrailingWhitespace.slice(directiveStart)
    if (isChatDirectivePrefix(candidate)) {
      return withoutTrailingWhitespace.slice(0, directiveStart).trimEnd()
    }
  }
  return withoutTrailingWhitespace.endsWith('[')
    ? withoutTrailingWhitespace.slice(0, -1).trimEnd()
    : withoutTrailingWhitespace
}

/**
 * Removes `[[orbit:...]]` directives Astra emits to request rendered cards. The
 * server strips them from the final message, but streamed deltas still carry them
 * mid-flight. Complete directives are always removed; a partial trailing token is
 * removed only while the message is actively streaming.
 */
export function stripChatDirectives(content: string, isStreaming = false): string {
  const withoutCompleteDirectives = content.replace(COMPLETE_CHAT_DIRECTIVE, '')
  return isStreaming
    ? stripTrailingChatDirectivePrefix(withoutCompleteDirectives)
    : withoutCompleteDirectives.trimEnd()
}
