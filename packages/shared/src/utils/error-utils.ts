import type { ZodType } from 'zod'

interface BackendErrorData {
  error?: string
  message?: string
  code?: string
  errorCode?: string
  requestId?: string
  type?: string
  status?: number
  data?: BackendErrorData
  errors?: Record<string, string[]>
}

interface ErrorWithData {
  data?: BackendErrorData
  status?: number
  code?: string
  errorCode?: string
  fieldErrors?: Record<string, string[]>
}

type FriendlyErrorContext =
  | 'auth'
  | 'goal'
  | 'goalProgress'
  | 'habit'
  | 'habitLog'
  | 'subHabit'
  | 'tag'
  | 'generic'

export class ApiClientError extends Error {
  status: number
  code?: string
  data?: unknown
  fieldErrors?: Record<string, string[]>

  constructor(
    status: number,
    message: string,
    options?: {
      code?: string
      data?: unknown
      fieldErrors?: Record<string, string[]>
    },
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = options?.code
    this.data = options?.data
    this.fieldErrors = options?.fieldErrors
  }
}

/**
 * Validates an already-parsed API response `body` against a Zod `schema` at the client
 * trust boundary. Returns the parsed data when it matches — unknown keys are stripped, so
 * additive API fields never break older clients (append-only contract) — or throws a typed
 * `ApiClientError` (502, `INVALID_RESPONSE_SCHEMA`) carrying the Zod issues when it does not.
 * When no `schema` is supplied the body is returned unchanged, making validation opt-in.
 */
export function validateApiResponse<T>(
  body: unknown,
  schema: ZodType<T> | undefined,
  path: string,
): T {
  if (!schema) return body as T

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError(502, `Unexpected API response shape for ${path}`, {
      code: 'INVALID_RESPONSE_SCHEMA',
      data: parsed.error.issues,
    })
  }

  return parsed.data
}

function isErrorWithData(err: unknown): err is ErrorWithData {
  return err !== null && typeof err === 'object'
}

function asBackendErrorData(value: unknown): BackendErrorData | undefined {
  if (value && typeof value === 'object') {
    return value
  }
  return undefined
}

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string

export function translateErrorKey(
  translate: TranslateFn,
  errorKey: string | null | undefined,
  values?: Record<string, string | number | Date>,
): string | null {
  if (!errorKey) return null
  return translate(errorKey, values)
}

function extractNestedData(err: unknown): BackendErrorData | undefined {
  if (!isErrorWithData(err)) return undefined

  const directData = asBackendErrorData(err.data)
  if (directData) return directData

  return asBackendErrorData(err)
}

function normalizeMessage(message: string | undefined): string {
  return message?.trim().toLowerCase() ?? ''
}

function getFirstValidationError(
  errors: Record<string, string[]> | undefined,
): string | undefined {
  if (!errors) return undefined

  const firstField = Object.values(errors)[0]
  if (Array.isArray(firstField) && firstField.length > 0) {
    return firstField[0]
  }

  return undefined
}

export function extractBackendFieldErrors(
  err: unknown,
): Record<string, string[]> | undefined {
  const data = extractNestedData(err)
  const nestedErrors = data?.data?.errors ?? data?.errors
  if (nestedErrors && typeof nestedErrors === 'object') {
    return nestedErrors
  }

  if (isErrorWithData(err) && err.fieldErrors) {
    return err.fieldErrors
  }

  return undefined
}

export function extractBackendErrorCode(err: unknown): string | undefined {
  const data = extractNestedData(err)
  const fromData =
    data?.data?.errorCode ??
    data?.data?.code ??
    data?.errorCode ??
    data?.code ??
    (isErrorWithData(err) ? err.errorCode ?? err.code : undefined)
  if (fromData) return fromData

  if (isErrorWithData(err)) {
    const body = asBackendErrorData((err as { body?: unknown }).body)
    return body?.errorCode ?? body?.code
  }

  return undefined
}

export function extractBackendStatus(err: unknown): number | undefined {
  if (isErrorWithData(err) && typeof err.status === 'number') {
    return err.status
  }

  const data = extractNestedData(err)
  if (typeof data?.status === 'number') {
    return data.status
  }

  return undefined
}

export function extractBackendRequestId(err: unknown): string | undefined {
  const data = extractNestedData(err)
  const requestId = data?.data?.requestId ?? data?.requestId
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    return undefined
  }

  return requestId
}

export function createApiClientError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): ApiClientError {
  const wrapped = { data: payload }
  const message = extractBackendError(wrapped) ?? fallbackMessage
  const code = extractBackendErrorCode(wrapped)
  const fieldErrors = extractBackendFieldErrors(wrapped)

  return new ApiClientError(status, message, {
    code,
    data: payload,
    fieldErrors,
  })
}

export function getErrorMessage(err: unknown, fallback: string): string {
  const backendMessage = extractBackendError(err)
  if (backendMessage) return backendMessage

  if (err instanceof Error && err.message.trim()) {
    return err.message
  }

  return fallback
}

export function extractBackendError(err: unknown): string | undefined {
  const data = extractNestedData(err)
  if (!data) return undefined

  const fieldError =
    getFirstValidationError(data.data?.errors) ??
    getFirstValidationError(data.errors)
  if (fieldError) return fieldError

  const backendError =
    data.data?.error ??
    data.data?.message ??
    data.error ??
    data.message
  if (backendError && typeof backendError === 'string') return backendError

  return undefined
}

type ContextSet = ReadonlySet<FriendlyErrorContext>

interface MessageRule {
  /** All substrings must be present (AND logic). Use an array of arrays for OR groups. */
  includes: readonly string[] | readonly (readonly string[])[]
  key: string
  contexts?: ContextSet
}

const HABIT_CONTEXTS: ContextSet = new Set(['habit', 'subHabit', 'habitLog'])
const GOAL_CONTEXTS: ContextSet = new Set(['goal', 'goalProgress'])
const TAG_CONTEXTS: ContextSet = new Set(['tag'])
const AUTH_CONTEXTS: ContextSet = new Set(['auth'])

const CONTEXTUAL_RULES: readonly MessageRule[] = [
  { includes: ['description', '2000'], key: 'habits.form.descriptionTooLong', contexts: HABIT_CONTEXTS },
  { includes: ['frequency quantity', 'required'], key: 'habits.form.frequencyRequired', contexts: HABIT_CONTEXTS },
  { includes: ['days can only be specified'], key: 'habits.form.daysOnlyForDaily', contexts: HABIT_CONTEXTS },
  { includes: ['general habits cannot be bad habits'], key: 'habits.form.generalBadHabit', contexts: HABIT_CONTEXTS },
  { includes: ['checklist item text'], key: 'habits.form.checklistItemTooLong', contexts: HABIT_CONTEXTS },
  { includes: ['scheduled reminders must not contain duplicate'], key: 'habits.form.duplicateScheduledReminder', contexts: HABIT_CONTEXTS },
  { includes: ['scheduled reminder', 'duplicate'], key: 'habits.form.duplicateScheduledReminder', contexts: HABIT_CONTEXTS },
  { includes: ['scheduled reminder', 'at most'], key: 'habits.form.scheduledReminderMax', contexts: HABIT_CONTEXTS },
  { includes: ['a habit can have at most', 'sub-habit'], key: 'habits.form.subHabitLimit', contexts: HABIT_CONTEXTS },
  { includes: ['sub-habit title', 'empty'], key: 'habits.form.subHabitTitleRequired', contexts: HABIT_CONTEXTS },
  { includes: ['sub-habit title', '200'], key: 'habits.form.subHabitTitleTooLong', contexts: HABIT_CONTEXTS },
  { includes: ['linked goals'], key: 'habits.form.goalLimit', contexts: HABIT_CONTEXTS },
  { includes: ['at most 5 tags'], key: 'habits.form.tagLimit', contexts: HABIT_CONTEXTS },
  { includes: ['already logged'], key: 'habits.errors.alreadyLogged', contexts: HABIT_CONTEXTS },
  { includes: [['max depth'], ['depth reached']], key: 'habits.errors.maxDepthReached', contexts: HABIT_CONTEXTS },
  { includes: ['circular'], key: 'habits.errors.circularReference', contexts: HABIT_CONTEXTS },

  { includes: ['unit', 'required'], key: 'goals.form.unitRequired', contexts: GOAL_CONTEXTS },
  { includes: ['unit', '50'], key: 'goals.form.unitTooLong', contexts: GOAL_CONTEXTS },
  { includes: [['target value'], ['must be greater than 0']], key: 'goals.form.targetValueRequired', contexts: GOAL_CONTEXTS },
  { includes: ['new value', 'greater than or equal to 0'], key: 'goals.form.progressValueInvalid', contexts: GOAL_CONTEXTS },
  { includes: ['linked habits'], key: 'goals.form.habitLimit', contexts: GOAL_CONTEXTS },

  { includes: ['name', 'required'], key: 'habits.form.tagNameRequired', contexts: TAG_CONTEXTS },
  { includes: ['name', '50'], key: 'habits.form.tagNameTooLong', contexts: TAG_CONTEXTS },
  { includes: ['valid hex color'], key: 'habits.form.tagColorInvalid', contexts: TAG_CONTEXTS },

  { includes: [['invalid verification code'], ['invalid code']], key: 'auth.errors.invalidCode', contexts: AUTH_CONTEXTS },
  { includes: ['expired'], key: 'auth.errors.codeExpired', contexts: AUTH_CONTEXTS },
]

function matchesIncludes(msg: string, includes: MessageRule['includes']): boolean {
  if (includes.length === 0) return false
  if (typeof includes[0] === 'string') {
    // react-doctor-disable-next-line js-set-map-lookups -- FP: `msg` is a string; `msg.includes(s)` is String.prototype.includes (substring test), not Array membership, so a Set is inapplicable (and each rule's pattern list is 1-3 entries). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    return (includes as readonly string[]).every((s) => msg.includes(s))
  }
  return (includes as readonly (readonly string[])[]).some((group) =>
    // react-doctor-disable-next-line js-set-map-lookups -- FP: `msg` is a string; `msg.includes(s)` is String.prototype.includes (substring test), not Array membership, so a Set is inapplicable (and each group is 1-2 entries). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    group.every((s) => msg.includes(s)),
  )
}

function getContextualMessageKey(
  normalizedMessage: string,
  context: FriendlyErrorContext,
): string | null {
  if (normalizedMessage.includes('title') && normalizedMessage.includes('required')) {
    return context === 'goal' ? 'goals.form.titleRequired' : 'habits.form.titleRequired'
  }
  if (normalizedMessage.includes('title') && normalizedMessage.includes('200')) {
    return context === 'goal' ? 'goals.form.titleTooLong' : 'habits.form.titleTooLong'
  }

  for (const rule of CONTEXTUAL_RULES) {
    if (rule.contexts && !rule.contexts.has(context)) continue
    if (matchesIncludes(normalizedMessage, rule.includes)) return rule.key
  }

  return null
}

/**
 * Maps stable backend error codes (orbit-api ErrorCodes) to friendly i18n keys.
 * Consulted after contextual form-field matching, so precise validation messages
 * still win; this guarantees every other backend error renders localized text
 * instead of the raw English message.
 */
export const ERROR_CODE_TO_KEY: Record<string, string> = {
  NO_PERMISSION: 'errors.api.noPermission',
  HABIT_NOT_OWNED: 'errors.api.noPermission',
  INVALID_SESSION: 'errors.api.sessionExpired',
  USER_FACTS_LIMIT_REACHED: 'errors.api.factsLimit',
  DUPLICATE_FACT: 'errors.api.duplicateFact',
  DUPLICATE_TAG_NAME: 'errors.api.duplicateTag',
  MAX_API_KEYS: 'errors.api.apiKeyLimit',
  MAX_TAGS_PER_HABIT: 'habits.form.tagLimit',
  MAX_HABITS_PER_GOAL: 'goals.form.habitLimit',
  MESSAGE_TOO_LONG: 'errors.api.messageTooLong',
  CHAT_HISTORY_TOO_LARGE: 'errors.api.messageTooLong',
  IMAGE_TOO_LARGE: 'errors.api.imageInvalid',
  IMAGE_EMPTY: 'errors.api.imageInvalid',
  IMAGE_EXTENSION_NOT_ALLOWED: 'errors.api.imageInvalid',
  IMAGE_FORMAT_UNKNOWN: 'errors.api.imageInvalid',
  IMAGE_NOT_AN_IMAGE: 'errors.api.imageInvalid',
  AUDIO_REQUIRED: 'errors.api.transcriptionFailed',
  AUDIO_TRANSCRIPTION_FAILED: 'errors.api.transcriptionFailed',
  AUDIO_TRANSCRIPTION_EMPTY: 'speech.noSpeech',
  HABIT_ALREADY_COMPLETED: 'habits.errors.alreadyLogged',
  CANNOT_LOG_FUTURE_DATE: 'errors.api.logNotAllowed',
  CANNOT_SKIP_FUTURE_DATE: 'errors.api.logNotAllowed',
  HABIT_NOT_YET_DUE: 'errors.api.logNotAllowed',
  NOT_SCHEDULED_ON_DATE: 'errors.api.logNotAllowed',
  ALL_INSTANCES_DONE: 'errors.api.logNotAllowed',
  BEYOND_OVERDUE_WINDOW: 'errors.api.logNotAllowed',
  SELF_PARENT: 'errors.api.selfParent',
  GENERAL_MISMATCH_WITH_PARENT: 'errors.api.generalMismatchWithParent',
  GENERAL_MISMATCH_WITH_CHILDREN: 'errors.api.generalMismatchWithChildren',
  CALENDAR_NOT_CONNECTED: 'errors.api.calendarNotConnected',
  CALENDAR_RECONNECT_REQUIRED: 'errors.api.calendarReconnect',
  CALENDAR_FETCH_FAILED: 'errors.api.calendarFetchFailed',
  AI_UNAVAILABLE: 'errors.api.aiUnavailable',
  AI_EMPTY_RESPONSE: 'errors.api.aiUnavailable',
  AI_NO_ACTIVE_CONVERSATION: 'errors.api.aiUnavailable',
  INVALID_REFERRAL_CODE: 'errors.api.referralInvalid',
  SELF_REFERRAL: 'errors.api.referralSelf',
  ALREADY_REFERRED: 'errors.api.referralAlready',
  REFERRAL_CAP_REACHED: 'errors.api.referralCap',
  NO_ACTIVE_SUBSCRIPTION: 'errors.api.subscriptionInactive',
  SUBSCRIPTION_NOT_FOUND: 'errors.api.subscriptionInactive',
  PLAY_PURCHASE_NOT_ACTIVE: 'errors.api.playPurchaseInactive',
  PLAY_PURCHASE_ACCOUNT_MISMATCH: 'errors.api.playPurchaseMismatch',
  PAYMENT_SERVICE_UNAVAILABLE: 'errors.api.paymentUnavailable',
  BILLING_DETAILS_UNAVAILABLE: 'errors.api.paymentUnavailable',
  INVALID_STEP_UP_CODE: 'errors.api.invalidStepUp',
  STEP_UP_COOLDOWN: 'toast.errors.tooManyRequests',
  CODE_REQUEST_COOLDOWN: 'toast.errors.tooManyRequests',
  RATE_LIMITED: 'toast.errors.tooManyRequests',
  INVALID_GOAL_STATUS: 'errors.api.invalidGoalStatus',
  DEADLINE_IN_PAST: 'goals.form.deadlineInPast',
  CONCURRENT_UPDATE_CONFLICT: 'toast.errors.conflict',
  VALIDATION_ERROR: 'toast.errors.validation',
  INTERNAL_SERVER_ERROR: 'toast.errors.server',
  USER_NOT_FOUND: 'toast.errors.notFound',
  FACT_NOT_FOUND: 'toast.errors.notFound',
  API_KEY_NOT_FOUND: 'toast.errors.notFound',
  NOTIFICATION_NOT_FOUND: 'toast.errors.notFound',
  TEMPLATE_NOT_FOUND: 'toast.errors.notFound',
  SUGGESTION_NOT_FOUND: 'toast.errors.notFound',
  PARENT_HABIT_NOT_FOUND: 'toast.errors.notFound',
  TARGET_PARENT_NOT_FOUND: 'toast.errors.notFound',
  PENDING_OPERATION_NOT_FOUND: 'toast.errors.notFound',
}

export function getFriendlyErrorKey(
  err: unknown,
  fallbackKey: string,
  context: FriendlyErrorContext = 'generic',
): string {
  const code = extractBackendErrorCode(err)
  const status = extractBackendStatus(err)
  const message = getErrorMessage(err, '')
  const normalizedMessage = normalizeMessage(message)

  if (code === 'PAY_GATE') return fallbackKey
  if (code === 'TOO_MANY_ATTEMPTS' || status === 429 || normalizedMessage.includes('please wait')) {
    return 'toast.errors.tooManyRequests'
  }
  if (code === 'INVALID_VERIFICATION_CODE') return 'auth.errors.invalidCode'
  if (code === 'CODE_EXPIRED') return 'auth.errors.codeExpired'
  if (code === 'ALREADY_LOGGED') return 'habits.errors.alreadyLogged'
  if (code === 'MAX_DEPTH_REACHED') return 'habits.errors.maxDepthReached'
  if (code === 'CIRCULAR_REFERENCE') return 'habits.errors.circularReference'
  if (
    code === 'HABIT_NOT_FOUND' ||
    code === 'GOAL_NOT_FOUND' ||
    code === 'TAG_NOT_FOUND' ||
    status === 404 ||
    normalizedMessage.includes('not found')
  ) {
    return 'toast.errors.notFound'
  }
  if (status !== undefined && status >= 500) {
    return 'toast.errors.server'
  }

  const contextualKey = getContextualMessageKey(normalizedMessage, context)
  if (contextualKey) return contextualKey

  if (code && ERROR_CODE_TO_KEY[code]) return ERROR_CODE_TO_KEY[code]

  return fallbackKey
}

export function getFriendlyErrorMessage(
  err: unknown,
  translate: TranslateFn,
  fallbackKey: string,
  context: FriendlyErrorContext = 'generic',
): string {
  return translate(getFriendlyErrorKey(err, fallbackKey, context))
}
