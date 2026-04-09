interface BackendErrorData {
  error?: string
  message?: string
  code?: string
  errorCode?: string
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

export function translateErrorKey(
  translate: (key: string, values?: Record<string, unknown>) => string,
  errorKey: string | null | undefined,
  values?: Record<string, unknown>,
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

  if (context === 'habit' || context === 'subHabit' || context === 'habitLog') {
    if (normalizedMessage.includes('description') && normalizedMessage.includes('2000')) {
      return 'habits.form.descriptionTooLong'
    }
    if (normalizedMessage.includes('frequency quantity') && normalizedMessage.includes('required')) {
      return 'habits.form.frequencyRequired'
    }
    if (normalizedMessage.includes('days can only be specified')) {
      return 'habits.form.daysOnlyForDaily'
    }
    if (normalizedMessage.includes('general habits cannot be bad habits')) {
      return 'habits.form.generalBadHabit'
    }
    if (normalizedMessage.includes('checklist item text')) {
      return 'habits.form.checklistItemTooLong'
    }
    if (normalizedMessage.includes('scheduled reminders must not contain duplicate')) {
      return 'habits.form.duplicateScheduledReminder'
    }
    if (normalizedMessage.includes('scheduled reminder') && normalizedMessage.includes('duplicate')) {
      return 'habits.form.duplicateScheduledReminder'
    }
    if (normalizedMessage.includes('scheduled reminder') && normalizedMessage.includes('at most')) {
      return 'habits.form.scheduledReminderMax'
    }
    if (normalizedMessage.includes('a habit can have at most') && normalizedMessage.includes('sub-habit')) {
      return 'habits.form.subHabitLimit'
    }
    if (normalizedMessage.includes('sub-habit title') && normalizedMessage.includes('empty')) {
      return 'habits.form.subHabitTitleRequired'
    }
    if (normalizedMessage.includes('sub-habit title') && normalizedMessage.includes('200')) {
      return 'habits.form.subHabitTitleTooLong'
    }
    if (normalizedMessage.includes('linked goals')) {
      return 'habits.form.goalLimit'
    }
    if (normalizedMessage.includes('at most 5 tags')) {
      return 'habits.form.tagLimit'
    }
    if (normalizedMessage.includes('note must not exceed 500')) {
      return 'habits.log.noteTooLong'
    }
    if (normalizedMessage.includes('already logged')) {
      return 'habits.errors.alreadyLogged'
    }
    if (normalizedMessage.includes('max depth') || normalizedMessage.includes('depth reached')) {
      return 'habits.errors.maxDepthReached'
    }
    if (normalizedMessage.includes('circular')) {
      return 'habits.errors.circularReference'
    }
  }

  if (context === 'goal' || context === 'goalProgress') {
    if (normalizedMessage.includes('unit') && normalizedMessage.includes('required')) {
      return 'goals.form.unitRequired'
    }
    if (normalizedMessage.includes('unit') && normalizedMessage.includes('50')) {
      return 'goals.form.unitTooLong'
    }
    if (
      normalizedMessage.includes('target value') ||
      normalizedMessage.includes('must be greater than 0')
    ) {
      return 'goals.form.targetValueRequired'
    }
    if (normalizedMessage.includes('new value') && normalizedMessage.includes('greater than or equal to 0')) {
      return 'goals.form.progressValueInvalid'
    }
    if (normalizedMessage.includes('linked habits')) {
      return 'goals.form.habitLimit'
    }
  }

  if (context === 'tag') {
    if (normalizedMessage.includes('name') && normalizedMessage.includes('required')) {
      return 'habits.form.tagNameRequired'
    }
    if (normalizedMessage.includes('name') && normalizedMessage.includes('50')) {
      return 'habits.form.tagNameTooLong'
    }
    if (normalizedMessage.includes('valid hex color')) {
      return 'habits.form.tagColorInvalid'
    }
  }

  if (context === 'auth') {
    if (normalizedMessage.includes('invalid verification code') || normalizedMessage.includes('invalid code')) {
      return 'auth.errors.invalidCode'
    }
    if (normalizedMessage.includes('expired')) {
      return 'auth.errors.codeExpired'
    }
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
  translate: (key: string, values?: Record<string, unknown>) => string,
  fallbackKey: string,
  context: FriendlyErrorContext = 'generic',
): string {
  return translate(getFriendlyErrorKey(err, fallbackKey, context))
}
