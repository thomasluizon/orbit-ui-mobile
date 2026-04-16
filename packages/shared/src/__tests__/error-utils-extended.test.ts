import { describe, it, expect } from 'vitest'
import {
  ApiClientError,
  createApiClientError,
  extractBackendError,
  extractBackendErrorCode,
  extractBackendFieldErrors,
  extractBackendRequestId,
  extractBackendStatus,
  getErrorMessage,
  getFriendlyErrorKey,
  getFriendlyErrorMessage,
  translateErrorKey,
} from '../utils/error-utils'

// ---------------------------------------------------------------------------
// ApiClientError class
// ---------------------------------------------------------------------------

describe('ApiClientError', () => {
  it('creates error with status and message', () => {
    const err = new ApiClientError(400, 'Bad request')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Bad request')
    expect(err.name).toBe('ApiClientError')
  })

  it('stores optional code, data, and fieldErrors', () => {
    const err = new ApiClientError(422, 'Validation', {
      code: 'INVALID',
      data: { field: 'title' },
      fieldErrors: { title: ['Too long'] },
    })
    expect(err.code).toBe('INVALID')
    expect(err.data).toEqual({ field: 'title' })
    expect(err.fieldErrors).toEqual({ title: ['Too long'] })
  })

  it('is an instance of Error', () => {
    const err = new ApiClientError(500, 'Server error')
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// createApiClientError
// ---------------------------------------------------------------------------

describe('createApiClientError', () => {
  it('creates error from payload with error message', () => {
    const err = createApiClientError(400, { error: 'Title is required' }, 'Fallback')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Title is required')
  })

  it('uses fallback when no error in payload', () => {
    const err = createApiClientError(500, null, 'Something went wrong')
    expect(err.message).toBe('Something went wrong')
  })

  it('extracts error code from payload', () => {
    const err = createApiClientError(400, { errorCode: 'PAY_GATE' }, 'Fallback')
    expect(err.code).toBe('PAY_GATE')
  })

  it('extracts field errors from payload', () => {
    const err = createApiClientError(
      400,
      { errors: { Title: ['Required'] } },
      'Fallback',
    )
    expect(err.fieldErrors).toEqual({ Title: ['Required'] })
  })
})

// ---------------------------------------------------------------------------
// extractBackendErrorCode
// ---------------------------------------------------------------------------

describe('extractBackendErrorCode', () => {
  it('extracts errorCode from nested data.data', () => {
    const err = { data: { data: { errorCode: 'PAY_GATE' } } }
    expect(extractBackendErrorCode(err)).toBe('PAY_GATE')
  })

  it('extracts code from direct data', () => {
    const err = { data: { code: 'INVALID' } }
    expect(extractBackendErrorCode(err)).toBe('INVALID')
  })

  it('extracts code from top-level error object', () => {
    const err = { code: 'TOP_LEVEL' }
    expect(extractBackendErrorCode(err)).toBe('TOP_LEVEL')
  })

  it('returns undefined for non-objects', () => {
    expect(extractBackendErrorCode(null)).toBeUndefined()
    expect(extractBackendErrorCode('string')).toBeUndefined()
    expect(extractBackendErrorCode(42)).toBeUndefined()
  })

  it('extracts errorCode from top-level', () => {
    const err = { errorCode: 'ALREADY_LOGGED' }
    expect(extractBackendErrorCode(err)).toBe('ALREADY_LOGGED')
  })
})

// ---------------------------------------------------------------------------
// extractBackendFieldErrors
// ---------------------------------------------------------------------------

describe('extractBackendFieldErrors', () => {
  it('extracts errors from data.data.errors', () => {
    const err = { data: { data: { errors: { Title: ['Required'] } } } }
    expect(extractBackendFieldErrors(err)).toEqual({ Title: ['Required'] })
  })

  it('extracts errors from data.errors', () => {
    const err = { data: { errors: { Email: ['Invalid'] } } }
    expect(extractBackendFieldErrors(err)).toEqual({ Email: ['Invalid'] })
  })

  it('extracts fieldErrors from top-level', () => {
    const err = { fieldErrors: { Name: ['Too long'] } }
    expect(extractBackendFieldErrors(err)).toEqual({ Name: ['Too long'] })
  })

  it('returns undefined when no errors present', () => {
    expect(extractBackendFieldErrors({})).toBeUndefined()
    expect(extractBackendFieldErrors(null)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractBackendStatus
// ---------------------------------------------------------------------------

describe('extractBackendStatus', () => {
  it('extracts status from top-level object', () => {
    expect(extractBackendStatus({ status: 404 })).toBe(404)
  })

  it('extracts status from nested data', () => {
    expect(extractBackendStatus({ data: { status: 500 } })).toBe(500)
  })

  it('returns undefined for non-numeric status', () => {
    expect(extractBackendStatus({ status: 'error' })).toBeUndefined()
  })

  it('returns undefined for non-objects', () => {
    expect(extractBackendStatus(null)).toBeUndefined()
    expect(extractBackendStatus(42)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractBackendRequestId
// ---------------------------------------------------------------------------

describe('extractBackendRequestId', () => {
  it('extracts requestId from nested data.data', () => {
    const err = { data: { data: { requestId: 'req_nested' } } }
    expect(extractBackendRequestId(err)).toBe('req_nested')
  })

  it('extracts requestId from direct data', () => {
    const err = { data: { requestId: 'req_direct' } }
    expect(extractBackendRequestId(err)).toBe('req_direct')
  })

  it('returns undefined for blank requestId values', () => {
    expect(extractBackendRequestId({ data: { requestId: '   ' } })).toBeUndefined()
  })

  it('returns undefined when requestId is missing', () => {
    expect(extractBackendRequestId({ data: { error: 'No request id' } })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// translateErrorKey
// ---------------------------------------------------------------------------

describe('translateErrorKey (extended)', () => {
  const translate = (key: string, values?: Record<string, unknown>) => {
    if (values) return `${key}:${JSON.stringify(values)}`
    return `t:${key}`
  }

  it('passes values to translate function', () => {
    const result = translateErrorKey(translate, 'error.key', { count: 5 })
    expect(result).toContain('"count":5')
  })

  it('returns null for empty string', () => {
    expect(translateErrorKey(translate, '')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getFriendlyErrorKey -- comprehensive contextual mapping
// ---------------------------------------------------------------------------

describe('getFriendlyErrorKey (extended coverage)', () => {
  // Error code mappings
  it('maps TOO_MANY_ATTEMPTS code', () => {
    const err = createApiClientError(400, { errorCode: 'TOO_MANY_ATTEMPTS' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.tooManyRequests')
  })

  it('maps INVALID_VERIFICATION_CODE code', () => {
    const err = createApiClientError(400, { errorCode: 'INVALID_VERIFICATION_CODE' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('auth.errors.invalidCode')
  })

  it('maps CODE_EXPIRED code', () => {
    const err = createApiClientError(400, { errorCode: 'CODE_EXPIRED' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('auth.errors.codeExpired')
  })

  it('maps ALREADY_LOGGED code', () => {
    const err = createApiClientError(400, { errorCode: 'ALREADY_LOGGED' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.errors.alreadyLogged')
  })

  it('maps MAX_SUB_HABITS_REACHED code', () => {
    const err = createApiClientError(400, { errorCode: 'MAX_SUB_HABITS_REACHED' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.form.subHabitLimit')
  })

  it('maps MAX_DEPTH_REACHED code', () => {
    const err = createApiClientError(400, { errorCode: 'MAX_DEPTH_REACHED' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.errors.maxDepthReached')
  })

  it('maps CIRCULAR_REFERENCE code', () => {
    const err = createApiClientError(400, { errorCode: 'CIRCULAR_REFERENCE' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.errors.circularReference')
  })

  it('maps HABIT_NOT_FOUND code', () => {
    const err = createApiClientError(400, { errorCode: 'HABIT_NOT_FOUND' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
  })

  it('maps GOAL_NOT_FOUND code', () => {
    const err = createApiClientError(400, { errorCode: 'GOAL_NOT_FOUND' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
  })

  it('maps TAG_NOT_FOUND code', () => {
    const err = createApiClientError(400, { errorCode: 'TAG_NOT_FOUND' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
  })

  it('maps "please wait" message to too many requests', () => {
    const err = createApiClientError(400, { error: 'Please wait before trying again' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.tooManyRequests')
  })

  it('maps "not found" message', () => {
    const err = createApiClientError(400, { error: 'Resource not found' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
  })

  // Habit contextual messages
  it('maps title required for habit context', () => {
    const err = createApiClientError(400, { error: 'Title is required' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.titleRequired')
  })

  it('maps title too long (200) for habit context', () => {
    const err = createApiClientError(400, { error: 'Title must be at most 200 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.titleTooLong')
  })

  it('maps description too long for habit context', () => {
    const err = createApiClientError(400, { error: 'Description must be at most 2000 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.descriptionTooLong')
  })

  it('maps frequency quantity required for habit context', () => {
    const err = createApiClientError(400, { error: 'Frequency quantity is required' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.frequencyRequired')
  })

  it('maps days only for daily habit context', () => {
    const err = createApiClientError(400, { error: 'Days can only be specified for daily habits' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.daysOnlyForDaily')
  })

  it('maps general bad habit error', () => {
    const err = createApiClientError(400, { error: 'General habits cannot be bad habits' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.generalBadHabit')
  })

  it('maps checklist item text error', () => {
    const err = createApiClientError(400, { error: 'Checklist item text is too long' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.checklistItemTooLong')
  })

  it('maps duplicate scheduled reminders error', () => {
    const err = createApiClientError(400, { error: 'Scheduled reminders must not contain duplicate times' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.duplicateScheduledReminder')
  })

  it('maps scheduled reminder duplicate alternative wording', () => {
    const err = createApiClientError(400, { error: 'Scheduled reminder has duplicate entries' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.duplicateScheduledReminder')
  })

  it('maps scheduled reminder max error', () => {
    const err = createApiClientError(400, { error: 'Scheduled reminder at most 5 allowed' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.scheduledReminderMax')
  })

  it('maps sub-habit limit error', () => {
    const err = createApiClientError(400, { error: 'A habit can have at most 20 sub-habit entries' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.subHabitLimit')
  })

  it('maps sub-habit title required error', () => {
    const err = createApiClientError(400, { error: 'Sub-habit title cannot be empty' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'subHabit')).toBe('habits.form.subHabitTitleRequired')
  })

  it('maps sub-habit title too long via title+200 check', () => {
    // The title+200 check fires first so sub-habit title containing
    // both "title" and "200" maps to the generic titleTooLong key
    const err = createApiClientError(400, { error: 'Sub-habit title must be at most 200 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'subHabit')).toBe('habits.form.titleTooLong')
  })

  it('maps linked goals limit for habit', () => {
    const err = createApiClientError(400, { error: 'Too many linked goals' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.goalLimit')
  })

  it('maps at most 5 tags for habit', () => {
    const err = createApiClientError(400, { error: 'A habit can have at most 5 tags' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.tagLimit')
  })

  it('maps already logged error', () => {
    const err = createApiClientError(400, { error: 'Habit already logged for this date' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habitLog')).toBe('habits.errors.alreadyLogged')
  })

  it('maps max depth reached', () => {
    const err = createApiClientError(400, { error: 'Max depth reached for nesting' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.errors.maxDepthReached')
  })

  it('maps circular reference', () => {
    const err = createApiClientError(400, { error: 'Circular reference detected' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.errors.circularReference')
  })

  // Goal contextual messages
  it('maps title required for goal context', () => {
    const err = createApiClientError(400, { error: 'Title is required' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.titleRequired')
  })

  it('maps title too long (200) for goal context', () => {
    const err = createApiClientError(400, { error: 'Title must be at most 200 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.titleTooLong')
  })

  it('maps unit required for goal context', () => {
    const err = createApiClientError(400, { error: 'Unit is required' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.unitRequired')
  })

  it('maps unit too long (50) for goal context', () => {
    const err = createApiClientError(400, { error: 'Unit must be at most 50 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.unitTooLong')
  })

  it('maps target value required for goal context', () => {
    const err = createApiClientError(400, { error: 'Target value must be greater than 0' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.targetValueRequired')
  })

  it('maps progress value invalid for goalProgress', () => {
    const err = createApiClientError(400, { error: 'New value must be greater than or equal to 0' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goalProgress')).toBe('goals.form.progressValueInvalid')
  })

  it('maps linked habits limit for goal context', () => {
    const err = createApiClientError(400, { error: 'Too many linked habits' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.habitLimit')
  })

  // Tag contextual messages
  it('maps name required for tag context', () => {
    const err = createApiClientError(400, { error: 'Tag name is required' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe('habits.form.tagNameRequired')
  })

  it('maps name too long (50) for tag context', () => {
    const err = createApiClientError(400, { error: 'Tag name must be at most 50 characters' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe('habits.form.tagNameTooLong')
  })

  // Auth contextual messages
  it('maps invalid verification code for auth context', () => {
    const err = createApiClientError(400, { error: 'Invalid verification code' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'auth')).toBe('auth.errors.invalidCode')
  })

  it('maps invalid code (short) for auth context', () => {
    const err = createApiClientError(400, { error: 'The invalid code was rejected' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'auth')).toBe('auth.errors.invalidCode')
  })

  it('maps expired code for auth context', () => {
    const err = createApiClientError(400, { error: 'Code has expired' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'auth')).toBe('auth.errors.codeExpired')
  })

  // Fallback behavior
  it('returns caller fallback when no matching context', () => {
    const err = createApiClientError(400, { error: 'Some random error' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'my.custom.fallback', 'generic')).toBe('my.custom.fallback')
  })

  it('returns server error for 5xx statuses', () => {
    const err = createApiClientError(503, { error: 'Service unavailable' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.server')
  })
})

// ---------------------------------------------------------------------------
// getFriendlyErrorMessage
// ---------------------------------------------------------------------------

describe('getFriendlyErrorMessage (extended)', () => {
  const translate = (key: string) => `t:${key}`

  it('translates too many requests key', () => {
    const err = createApiClientError(429, { error: 'Rate limited' }, 'fallback')
    expect(getFriendlyErrorMessage(err, translate, 'errors.generic')).toBe(
      't:toast.errors.tooManyRequests',
    )
  })

  it('translates habit title required key', () => {
    const err = createApiClientError(400, { error: 'Title is required' }, 'fallback')
    expect(getFriendlyErrorMessage(err, translate, 'errors.generic', 'habit')).toBe(
      't:habits.form.titleRequired',
    )
  })

  it('falls back to provided key when no match', () => {
    const err = createApiClientError(400, { error: 'Unknown error' }, 'fallback')
    expect(getFriendlyErrorMessage(err, translate, 'my.fallback', 'generic')).toBe(
      't:my.fallback',
    )
  })
})

// ---------------------------------------------------------------------------
// getErrorMessage -- edge cases
// ---------------------------------------------------------------------------

describe('getErrorMessage (edge cases)', () => {
  it('returns Error message over fallback', () => {
    expect(getErrorMessage(new Error('Specific'), 'Generic')).toBe('Specific')
  })

  it('returns fallback for Error with empty message', () => {
    expect(getErrorMessage(new Error(''), 'Generic')).toBe('Generic')
  })

  it('returns whitespace Error message via backend extraction path', () => {
    // Error objects have a .message property that extractBackendError reads
    // as data.message, so whitespace-only messages are returned as-is
    const result = getErrorMessage(new Error('   '), 'Generic')
    expect(result).toBe('   ')
  })

  it('prefers backend error over Error.message', () => {
    const err = new Error('generic')
    ;(err as unknown as Record<string, unknown>).data = { error: 'Backend says no' }
    expect(getErrorMessage(err, 'Fallback')).toBe('Backend says no')
  })

  it('returns data.message from nested response', () => {
    const err = { data: { data: { message: 'Deeply nested' } } }
    expect(getErrorMessage(err, 'Fallback')).toBe('Deeply nested')
  })
})
