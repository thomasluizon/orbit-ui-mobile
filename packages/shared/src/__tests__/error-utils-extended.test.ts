import { describe, it, expect } from 'vitest'
import { z } from 'zod'
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
  validateApiResponse,
} from '../utils/error-utils'


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

  it('extracts errorCode from a web BFF {status, body} envelope', () => {
    const err = { status: 400, body: { error: 'text', errorCode: 'CODE_EXPIRED' } }
    expect(extractBackendErrorCode(err)).toBe('CODE_EXPIRED')
  })

  it('extracts code from a {body} envelope when errorCode is absent', () => {
    const err = { status: 400, body: { code: 'INVALID_EMAIL' } }
    expect(extractBackendErrorCode(err)).toBe('INVALID_EMAIL')
  })

  it('prefers data over body when both carry a code', () => {
    const err = { data: { errorCode: 'FROM_DATA' }, body: { errorCode: 'FROM_BODY' } }
    expect(extractBackendErrorCode(err)).toBe('FROM_DATA')
  })
})


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
/**
 * Builds the body `orbit-api` sends for a coded failure: `ErrorResponse` serializes exactly
 * `error` and `errorCode`, and `LocalizedErrorResultFilter` swaps `error` for the localized copy
 * selected by `errorCode`. The English sentences below are read from `ErrorCopy` on
 * `thomasluizon/orbit-api` PR 532 (`feature/ticket-75-emails`).
 */
function codedError(errorCode: string, error: string) {
  return createApiClientError(400, { error, errorCode }, 'Request failed')
}

/**
 * Builds the body `ValidationExceptionHandler` sends for a FluentValidation failure. It carries
 * no error code at all, so the English sentence is the only handle the client has. The messages
 * below are the real `WithMessage` text, or FluentValidation 12.1.1's English default for the
 * rule, read from the installed `FluentValidation.dll`.
 */
function validationFailure(property: string, message: string) {
  return createApiClientError(
    400,
    { type: 'ValidationFailure', status: 400, requestId: 'req-1', errors: { [property]: [message] } },
    'Validation failed',
  )
}

describe('getFriendlyErrorKey (extended coverage)', () => {
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

  it('maps MAX_DEPTH_REACHED code', () => {
    const err = createApiClientError(400, { errorCode: 'MAX_DEPTH_REACHED' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.errors.maxDepthReached')
  })

  it('maps CIRCULAR_REFERENCE code', () => {
    const err = createApiClientError(400, { errorCode: 'CIRCULAR_REFERENCE' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('habits.errors.circularReference')
  })

  it.each(['HABIT_NOT_FOUND', 'GOAL_NOT_FOUND', 'TAG_NOT_FOUND'])(
    'maps %s code to notFound',
    (errorCode) => {
      const err = createApiClientError(400, { errorCode }, 'fallback')
      expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
    },
  )

  it('maps "please wait" message to too many requests', () => {
    const err = createApiClientError(400, { error: 'Please wait before trying again' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.tooManyRequests')
  })

  it('maps "not found" message', () => {
    const err = createApiClientError(400, { error: 'Resource not found' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.notFound')
  })

  it('maps an empty habit title from the validator', () => {
    const err = validationFailure('Title', "'Title' must not be empty.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.titleRequired')
  })

  it('maps a habit title over 200 characters from the validator', () => {
    const err = validationFailure(
      'Title',
      "The length of 'Title' must be 200 characters or fewer. You entered 201 characters.",
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.titleTooLong')
  })

  it('maps a habit description over 10000 characters from the validator', () => {
    const err = validationFailure(
      'Description',
      "The length of 'Description' must be 10000 characters or fewer. You entered 10001 characters.",
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.descriptionTooLong')
  })

  it('maps frequency quantity required for habit context', () => {
    const err = validationFailure(
      'FrequencyQuantity',
      'Frequency quantity is required when frequency unit is set',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.frequencyRequired')
  })

  it('maps days only for daily habit context', () => {
    const err = validationFailure(
      'Days',
      'Days can only be specified for a daily habit (frequency unit Day, quantity 1)',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.daysOnlyForDaily')
  })

  it('maps checklist item text error', () => {
    const err = validationFailure(
      'ChecklistItems',
      'Checklist item text must not exceed 500 characters',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.checklistItemTooLong')
  })

  it('maps duplicate scheduled reminders from the validator', () => {
    const err = validationFailure(
      'ScheduledReminders',
      'Scheduled reminders must not contain duplicate entries',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.duplicateScheduledReminder')
  })

  it('maps the scheduled reminder ceiling from the validator', () => {
    const err = validationFailure(
      'ScheduledReminders',
      'A habit can have at most 5 scheduled reminders',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.scheduledReminderMax')
  })

  it('maps sub-habit limit error', () => {
    const err = validationFailure('SubHabits', 'A habit can have at most 20 sub-habits')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.subHabitLimit')
  })

  it('maps sub-habit title required error', () => {
    const err = validationFailure('SubHabits[0]', 'Sub-habit title must not be empty')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'subHabit')).toBe('habits.form.subHabitTitleRequired')
  })

  it('maps a sub-habit title over its limit to the sub-habit key, not the habit one', () => {
    const err = validationFailure(
      'SubHabits[0]',
      'Sub-habit title must not exceed 200 characters',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'subHabit')).toBe(
      'habits.form.subHabitTitleTooLong',
    )
  })

  it('maps a nested sub-habit title over its limit while the form is creating a habit', () => {
    const err = validationFailure(
      'SubHabits[0]',
      'Sub-habit title must not exceed 200 characters',
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe(
      'habits.form.subHabitTitleTooLong',
    )
  })

  it('maps linked goals limit for habit', () => {
    const err = validationFailure('GoalIds', 'A habit can have at most 10 linked goals.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.goalLimit')
  })

  it('maps at most 5 tags for habit', () => {
    const err = validationFailure('Tags', 'A habit can have at most 5 tags')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.tagLimit')
  })

  it('maps an already-logged habit through its code, not its sentence', () => {
    const err = codedError('ALREADY_LOGGED', 'You already logged this habit on that day.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habitLog')).toBe('habits.errors.alreadyLogged')
  })

  it('maps an empty goal title from the validator', () => {
    const err = validationFailure('Title', "'Title' must not be empty.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.titleRequired')
  })

  it('maps a goal title over 200 characters from the validator', () => {
    const err = validationFailure(
      'Title',
      "The length of 'Title' must be 200 characters or fewer. You entered 201 characters.",
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.titleTooLong')
  })

  it('maps an empty goal unit from the validator', () => {
    const err = validationFailure('Unit', "'Unit' must not be empty.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.unitRequired')
  })

  it('maps a goal unit over 50 characters from the validator', () => {
    const err = validationFailure(
      'Unit',
      "The length of 'Unit' must be 50 characters or fewer. You entered 51 characters.",
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.unitTooLong')
  })

  it('maps a non-positive target value from the validator', () => {
    const err = validationFailure('TargetValue', "'Target Value' must be greater than '0'.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.targetValueRequired')
  })

  it('maps a negative progress value from the validator', () => {
    const err = validationFailure('NewValue', "'New Value' must be greater than or equal to '0'.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goalProgress')).toBe('goals.form.progressValueInvalid')
  })

  it('maps linked habits limit for goal context', () => {
    const err = validationFailure('HabitIds', 'A goal can have at most 20 linked habits.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.habitLimit')
  })

  it('maps an empty tag name from the validator', () => {
    const err = validationFailure('Name', "'Name' must not be empty.")
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe('habits.form.tagNameRequired')
  })

  it('maps a tag name over 50 characters from the validator', () => {
    const err = validationFailure(
      'Name',
      "The length of 'Name' must be 50 characters or fewer. You entered 51 characters.",
    )
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe('habits.form.tagNameTooLong')
  })

  it('maps an invalid tag colour from the validator', () => {
    const err = validationFailure('Color', 'Color must be a valid hex color (e.g. #FF5733)')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'tag')).toBe('habits.form.tagColorInvalid')
  })

  it('maps an expired code through its code, not its sentence', () => {
    const err = codedError('CODE_EXPIRED', 'That code expired. Ask for a new one.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'auth')).toBe('auth.errors.codeExpired')
  })

  it.each([
    ['CALENDAR_RECONNECT_REQUIRED', 'Your Google Calendar connection expired. Connect it again.', 'errors.api.calendarReconnect'],
    ['SUGGESTION_NOT_FOUND', 'That suggestion expired. Ask Astra again.', 'toast.errors.notFound'],
  ] as const)('keeps %s off the expired-code message in an auth context', (errorCode, sentence, expected) => {
    const err = codedError(errorCode, sentence)
    expect(getFriendlyErrorKey(err, 'errors.generic', 'auth')).toBe(expected)
  })

  it('returns caller fallback when no matching context', () => {
    const err = createApiClientError(400, { error: 'Some random error' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'my.custom.fallback', 'generic')).toBe('my.custom.fallback')
  })

  it('returns server error for 5xx statuses', () => {
    const err = createApiClientError(503, { error: 'Service unavailable' }, 'fallback')
    expect(getFriendlyErrorKey(err, 'errors.generic')).toBe('toast.errors.server')
  })
})


/**
 * orbit-api PR 532 rewrites the English sentence behind every error code, so a form error can no
 * longer be recognised by its prose. Each case below sends the REWRITTEN sentence with its code
 * and expects the specific key, never the caller's fallback. Remove the code entry and the case
 * returns `errors.generic`, which is the defect this suite exists to catch.
 */
describe('getFriendlyErrorKey resolves a rewritten form error by its code', () => {
  it('resolves TITLE_REQUIRED to the habit key in a habit context', () => {
    const err = codedError('TITLE_REQUIRED', 'Give this a title.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'habit')).toBe('habits.form.titleRequired')
  })

  it('resolves TITLE_REQUIRED to the goal key in a goal context', () => {
    const err = codedError('TITLE_REQUIRED', 'Give this a title.')
    expect(getFriendlyErrorKey(err, 'errors.generic', 'goal')).toBe('goals.form.titleRequired')
  })

  it.each([
    ['UNIT_REQUIRED', 'Name what you are counting, such as pages or minutes.', 'goal', 'goals.form.unitRequired'],
    ['TARGET_VALUE_INVALID', 'Set the target above 0.', 'goal', 'goals.form.targetValueRequired'],
    ['TAG_NAME_REQUIRED', 'Enter a tag name.', 'tag', 'habits.form.tagNameRequired'],
    ['DUPLICATE_SCHEDULED_REMINDERS', 'Two reminders point at the same moment. Change one of them.', 'habit', 'habits.form.duplicateScheduledReminder'],
    ['MAX_SCHEDULED_REMINDERS', 'A habit holds 5 scheduled reminders. Remove one to add another.', 'habit', 'habits.form.scheduledReminderMax'],
    ['GENERAL_HABIT_IS_BAD', 'A general habit cannot be one you are quitting.', 'habit', 'habits.form.generalBadHabit'],
  ] as const)('resolves %s to its own key', (errorCode, sentence, context, expected) => {
    const err = codedError(errorCode, sentence)
    expect(getFriendlyErrorKey(err, 'errors.generic', context)).toBe(expected)
  })

  it.each([
    ['DAYS_REQUIRE_QUANTITY_ONE', 'Specific days work only when the habit repeats once a day. Set it to once a day, or clear the days.', 'habit', 'habits.form.daysOnlyForDaily'],
    ['FREQUENCY_QUANTITY_INVALID', 'Set the frequency to 1 or more.', 'habit', 'habits.form.frequencyRequired'],
    ['TAG_COLOR_REQUIRED', 'Pick a colour for the tag.', 'tag', 'habits.form.tagColorInvalid'],
    ['PROGRESS_NEGATIVE', 'Progress cannot go below 0.', 'goalProgress', 'goals.form.progressValueInvalid'],
  ] as const)('resolves %s, whose sentence rule also stopped matching', (errorCode, sentence, context, expected) => {
    const err = codedError(errorCode, sentence)
    expect(getFriendlyErrorKey(err, 'errors.generic', context)).toBe(expected)
  })

  it.each([
    ['MAX_TAGS_PER_HABIT', 'A habit carries 5 tags. Remove one to add another.', 'habit', 'habits.form.tagLimit'],
    ['MAX_HABITS_PER_GOAL', 'A goal links 20 habits. Unlink one to add another.', 'goal', 'goals.form.habitLimit'],
  ] as const)('keeps %s resolving through the code it already had', (errorCode, sentence, context, expected) => {
    const err = codedError(errorCode, sentence)
    expect(getFriendlyErrorKey(err, 'errors.generic', context)).toBe(expected)
  })
})



describe('a rewritten sentence does not borrow another rule', () => {
  const GOAL_PROGRESS_DERIVED_SENTENCE =
    'This goal counts progress from its linked habits, so it cannot be set by hand.'
  const HABIT_LIMIT_SENTENCE = 'A goal can have at most 20 linked habits.'

  it.each(['goal', 'goalProgress'] as const)(
    'resolves GOAL_PROGRESS_DERIVED to the caller fallback in a %s context, never the habit limit',
    (context) => {
      const err = codedError('GOAL_PROGRESS_DERIVED', GOAL_PROGRESS_DERIVED_SENTENCE)
      const key = getFriendlyErrorKey(err, 'goals.errors.progress', context)
      expect(key).not.toBe('goals.form.habitLimit')
      expect(key).toBe('goals.errors.progress')
    },
  )

  it.each(['goal', 'goalProgress'] as const)(
    'still resolves the real linked-habit limit sentence in a %s context',
    (context) => {
      const err = validationFailure('HabitIds', HABIT_LIMIT_SENTENCE)
      expect(getFriendlyErrorKey(err, 'goals.errors.progress', context)).toBe('goals.form.habitLimit')
    },
  )
})


describe('getFriendlyErrorMessage (extended)', () => {
  const translate = (key: string) => `t:${key}`

  it('translates too many requests key', () => {
    const err = createApiClientError(429, { error: 'Rate limited' }, 'fallback')
    expect(getFriendlyErrorMessage(err, translate, 'errors.generic')).toBe(
      't:toast.errors.tooManyRequests',
    )
  })

  it('translates habit title required key', () => {
    const err = codedError('TITLE_REQUIRED', 'Give this a title.')
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


describe('getErrorMessage (edge cases)', () => {
  it('returns Error message over fallback', () => {
    expect(getErrorMessage(new Error('Specific'), 'Generic')).toBe('Specific')
  })

  it('returns fallback for Error with empty message', () => {
    expect(getErrorMessage(new Error(''), 'Generic')).toBe('Generic')
  })

  it('returns whitespace Error message via backend extraction path', () => {
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

describe('validateApiResponse', () => {
  const schema = z.object({ id: z.string(), count: z.number() })

  it('returns the parsed body when it matches the schema', () => {
    const body = { id: 'h-1', count: 3 }
    expect(validateApiResponse(body, schema, '/api/x')).toEqual(body)
  })

  it('still passes but strips additive unknown fields (append-only contract)', () => {
    const body = { id: 'h-1', count: 3, serverAddedLater: { experiment: true } }
    expect(validateApiResponse(body, schema, '/api/x')).toEqual({ id: 'h-1', count: 3 })
  })

  it('throws a typed 502 ApiClientError on a contract mismatch', () => {
    try {
      validateApiResponse({ id: 42, count: 'nope' }, schema, '/api/x')
      expect.unreachable('validateApiResponse should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      const apiError = error as ApiClientError
      expect(apiError.status).toBe(502)
      expect(apiError.code).toBe('INVALID_RESPONSE_SCHEMA')
      expect(apiError.message).toContain('/api/x')
      expect(Array.isArray(apiError.data)).toBe(true)
    }
  })

  it('returns the body untouched when no schema is supplied (opt-in)', () => {
    const body = { anything: true }
    expect(validateApiResponse(body, undefined, '/api/x')).toBe(body)
  })
})
