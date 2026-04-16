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

export type FriendlyErrorContext =
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

function isErrorWithData(err: unknown): err is ErrorWithData {
  return err !== null && typeof err === 'object'
}

function asBackendErrorData(value: unknown): BackendErrorData | undefined {
  if (value && typeof value === 'object') {
    return value as BackendErrorData
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
  return (
    data?.data?.errorCode ??
    data?.data?.code ??
    data?.errorCode ??
    data?.code ??
    (isErrorWithData(err) ? err.errorCode ?? err.code : undefined)
  )
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
  // Habit rules
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

  // Goal rules
  { includes: ['unit', 'required'], key: 'goals.form.unitRequired', contexts: GOAL_CONTEXTS },
  { includes: ['unit', '50'], key: 'goals.form.unitTooLong', contexts: GOAL_CONTEXTS },
  { includes: [['target value'], ['must be greater than 0']], key: 'goals.form.targetValueRequired', contexts: GOAL_CONTEXTS },
  { includes: ['new value', 'greater than or equal to 0'], key: 'goals.form.progressValueInvalid', contexts: GOAL_CONTEXTS },
  { includes: ['linked habits'], key: 'goals.form.habitLimit', contexts: GOAL_CONTEXTS },

  // Tag rules
  { includes: ['name', 'required'], key: 'habits.form.tagNameRequired', contexts: TAG_CONTEXTS },
  { includes: ['name', '50'], key: 'habits.form.tagNameTooLong', contexts: TAG_CONTEXTS },
  { includes: ['valid hex color'], key: 'habits.form.tagColorInvalid', contexts: TAG_CONTEXTS },

  // Auth rules
  { includes: [['invalid verification code'], ['invalid code']], key: 'auth.errors.invalidCode', contexts: AUTH_CONTEXTS },
  { includes: ['expired'], key: 'auth.errors.codeExpired', contexts: AUTH_CONTEXTS },
]

function matchesIncludes(msg: string, includes: MessageRule['includes']): boolean {
  if (includes.length === 0) return false
  // If the first element is a string, treat as AND list
  if (typeof includes[0] === 'string') {
    return (includes as readonly string[]).every((s) => msg.includes(s))
  }
  // Otherwise treat as OR groups (any group matching means a match)
  return (includes as readonly (readonly string[])[]).some((group) =>
    group.every((s) => msg.includes(s)),
  )
}

function getContextualMessageKey(
  normalizedMessage: string,
  context: FriendlyErrorContext,
): string | null {
  // Context-free title rules
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
  if (code === 'MAX_SUB_HABITS_REACHED') return 'habits.form.subHabitLimit'
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
