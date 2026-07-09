import { getFriendlyErrorMessage } from '@orbit/shared/utils'

export type WizardStage = 'browse' | 'importing' | 'done' | 'error'

export type Step =
  | 'loading'
  | 'select'
  | 'importing'
  | 'done'
  | 'error'
  | 'not-connected'
  | 'offline'

type Translate = (key: string, values?: Record<string, string | number | Date>) => string

export interface CalendarSyncStepInput {
  wizardStage: WizardStage
  isOnline: boolean
  isReviewMode: boolean
  isQueryLoading: boolean
  isQueryError: boolean
  eventsStatus: string | undefined
}

/** Resolves the wizard step from the current stage, connectivity, and query state. */
export function resolveCalendarSyncStep(input: CalendarSyncStepInput): Step {
  if (input.wizardStage === 'importing') return 'importing'
  if (input.wizardStage === 'done') return 'done'
  if (input.wizardStage === 'error') return 'error'
  if (!input.isOnline) return 'offline'
  if (input.isQueryLoading) return 'loading'
  if (input.isQueryError) return 'error'
  if (!input.isReviewMode && input.eventsStatus === 'not-connected') {
    return 'not-connected'
  }
  return 'select'
}

export interface DisplayedErrorMessageInput {
  wizardStage: WizardStage
  errorMessage: string
  isQueryError: boolean
  queryError: unknown
  translate: Translate
}

/** Resolves the error text to show: the wizard's own message, else the query error, else empty. */
export function resolveDisplayedErrorMessage(input: DisplayedErrorMessageInput): string {
  if (input.wizardStage === 'error') return input.errorMessage
  if (input.isQueryError) {
    return getFriendlyErrorMessage(input.queryError, input.translate, 'calendar.fetchError', 'generic')
  }
  return ''
}

/**
 * Resolves the next selected-event set when the incoming events change: in
 * review mode (after the first load) keep the still-present prior selections,
 * otherwise select every incoming event.
 */
export function resolveSyncedSelection(
  previousSelection: ReadonlySet<string>,
  incomingEvents: readonly { id: string }[],
  isReviewMode: boolean,
  previousEventsKey: string | null,
): Set<string> {
  if (isReviewMode && previousEventsKey !== null) {
    const next = new Set<string>()
    for (const event of incomingEvents) {
      if (previousSelection.has(event.id)) next.add(event.id)
    }
    return next
  }
  return new Set(incomingEvents.map((event) => event.id))
}
