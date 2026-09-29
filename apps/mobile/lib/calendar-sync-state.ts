import { getFriendlyErrorMessage } from "@orbit/shared/utils"

export type WizardStage = "browse" | "importing" | "done" | "error"

export type Step =
  | "loading"
  | "select"
  | "importing"
  | "done"
  | "error"
  | "not-connected"
  | "offline"

type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string

export interface CalendarSyncStepInput {
  wizardStage: WizardStage
  isProfileLoading: boolean
  isOnline: boolean
  isReviewMode: boolean
  isQueryLoading: boolean
  isQueryError: boolean
  eventsStatus: string | undefined
}

/** Resolves the wizard step from the current stage, connectivity, and query state. */
export function resolveCalendarSyncStep(input: CalendarSyncStepInput): Step {
  if (input.wizardStage === "importing") return "importing"
  if (input.wizardStage === "done") return "done"
  if (input.wizardStage === "error") return "error"
  if (input.isProfileLoading) return "loading"
  if (!input.isOnline) return "offline"
  if (input.isQueryLoading) return "loading"
  if (input.isQueryError) return "error"
  if (!input.isReviewMode && input.eventsStatus === "not-connected") {
    return "not-connected"
  }
  return "select"
}

export interface DisplayedErrorMessageInput {
  wizardStage: WizardStage
  errorMessage: string
  isQueryError: boolean
  queryError: unknown
  translate: Translate
}

/** Resolves the error text to show: the wizard's own message, else the query error, else empty. */
export function resolveDisplayedErrorMessage(
  input: DisplayedErrorMessageInput,
): string {
  if (input.wizardStage === "error") return input.errorMessage
  if (input.isQueryError) {
    return getFriendlyErrorMessage(
      input.queryError,
      input.translate,
      "calendar.fetchError",
      "textless",
    )
  }
  return ""
}
