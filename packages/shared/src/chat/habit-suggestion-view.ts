import type { StateHook } from '../hooks/state-adapter'
import type { HabitSuggestionState } from './habit-suggestion-controller'
import type { ChatMessage } from '../types/chat'
import type { HabitSuggestionsCard } from '../types/habit-suggestions'
import type { HabitSuggestionActions } from './habit-suggestion-controller'
import { HabitSuggestionController } from './habit-suggestion-controller'
import { habitSuggestionStatus } from './habit-suggestions'
import { computeHabitFrequencyLabel } from '../utils/habit-card-helpers'
import { formatLocaleDate, formatLocaleTime } from '../utils/locale-format'
import type { HabitDetail } from '../types/habit'

type Schedule = Pick<HabitDetail, 'frequencyUnit' | 'frequencyQuantity' | 'days' | 'dueDate' | 'dueTime' | 'dueEndTime'> & Partial<Pick<HabitDetail, 'isGeneral' | 'isFlexible'>>

export function habitSuggestionSchedule(schedule: Schedule, locale: string, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const cadence = computeHabitFrequencyLabel({ ...schedule, isFlexible: schedule.isFlexible ?? false, isGeneral: schedule.isGeneral ?? false }, t)
  const start = schedule.dueDate ? formatLocaleDate(schedule.dueDate, locale) : null
  if (schedule.isGeneral) return t('habits.form.noSchedule')
  return [cadence, start, schedule.dueTime ? formatLocaleTime(schedule.dueTime, locale) : null,
    schedule.dueEndTime ? formatLocaleTime(schedule.dueEndTime, locale) : null].filter(Boolean).join(' · ')
}

export interface HabitSuggestionView {
  controller: HabitSuggestionController
  state: HabitSuggestionState
  drafts: HabitSuggestionsCard['drafts']
  disabled: boolean
  editing: HabitSuggestionsCard['drafts'][number] | null
  edit: (id: string | null) => void
  applied: (id: string) => void
  available: (id: string) => boolean
  add: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
  addAll: () => Promise<void>
  refine: (id: string, instruction: string) => Promise<void>
}

export function createUseHabitSuggestionView({ useState, useSyncExternalStore }: {
  useState: StateHook
  useSyncExternalStore: <Value>(subscribe: (listener: () => void) => () => void, getSnapshot: () => Value, getServerSnapshot: () => Value) => Value
}): (card: HabitSuggestionsCard, message: ChatMessage, actions: HabitSuggestionActions, isOnline: boolean) => HabitSuggestionView {
 return function useHabitSuggestionView(card: HabitSuggestionsCard, message: ChatMessage, actions: HabitSuggestionActions, isOnline: boolean): HabitSuggestionView {
  const [controller] = useState(() => new HabitSuggestionController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [editing, setEditing] = useState<string | null>(null)
  const drafts = card.drafts.filter(draft => habitSuggestionStatus(message, draft.id) !== 'applied')
  const disabled = Boolean(state.busy) || !isOnline
  return {
    controller, state, drafts, disabled,
    editing: card.drafts.find(draft => draft.id === editing) ?? null,
    edit: setEditing,
    applied: (id: string) => actions.transition(current => ({ ...current, appliedHabitSuggestions: [...(current.appliedHabitSuggestions ?? []), id] })),
    available: (id: string) => habitSuggestionStatus(message, id) === 'available',
    add: (id: string) => controller.preview(card.drafts.filter(draft => draft.id === id), false, message, actions),
    retry: (id: string) => controller.retry(id, message, actions),
    addAll: () => controller.preview(card.drafts, true, message, actions),
    refine: (id: string, instruction: string) => {
      const draft = card.drafts.find(candidate => candidate.id === id)
      return draft ? controller.refine(draft, instruction, actions) : Promise.resolve()
    },
  }
}

}
