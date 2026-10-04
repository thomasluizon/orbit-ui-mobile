import { describe, expect, it } from 'vitest'
import { createApiClientError, extractBackendErrorCode, extractBackendFieldErrors, extractBackendErrorDetails, getBackendFieldError, getFriendlyErrorMessage } from '../utils/error-utils'
import { validationFailureSchema } from '../types/api'
import { verificationValidationResponses } from '../test-support/validation-fixtures'

describe('validation response parsing', () => {
  it.each(['en', 'pt-BR'] as const)('retains ordered messages and codes in %s', (language) => {
    const payload = verificationValidationResponses[language]
    const error = createApiClientError(400, payload, 'Fallback')
    expect(extractBackendErrorCode(error)).toBe('ExactLengthValidator')
    expect(error).toHaveProperty('errorDetails', payload.errorDetails)
    expect(extractBackendFieldErrors(error)).toEqual(payload.errors)
    expect(error.message).toBe(payload.errors.Code[0])
    expect(extractBackendErrorDetails({ data: { data: payload } })).toEqual(payload.errorDetails)
    expect(getBackendFieldError(error, 'code')).toBe(payload.errors.Code.join('\n'))
    expect(validationFailureSchema.parse(payload)).toEqual(payload)
  })

  it('reads validation codes through the auth body wrapper', () => {
    expect(extractBackendErrorCode({ body: verificationValidationResponses.en })).toBe('ExactLengthValidator')
    expect(extractBackendFieldErrors({ body: verificationValidationResponses.en })).toEqual(verificationValidationResponses.en.errors)
  })

  it('keeps legacy validation messages without inventing codes', () => {
    const error = createApiClientError(400, { errors: { Email: ['Invalid email', 'Another failure'] } }, 'Fallback')
    expect(error.fieldErrors).toEqual({ Email: ['Invalid email', 'Another failure'] })
    expect(error.code).toBeUndefined()
    expect(error.message).toBe('Invalid email')
    expect(getBackendFieldError({ body: { errors: { Email: ['Invalid email', 'Another failure'] } } }, 'Email')).toBe('Invalid email\nAnother failure')
  })
  it('preserves dynamic server copy instead of a client translation', () => {
    const error = createApiClientError(400, verificationValidationResponses.en, 'Fallback')
    expect(getFriendlyErrorMessage(error, () => 'Wrong replacement', 'fallback', 'auth')).toBe(verificationValidationResponses.en.errors.Code[0])
  })

  it('retains multiple fields and leaves unknown codes intact', () => {
    const payload = { errors: { Title: ['First', 'Second'], Code: ['Third'] }, errorDetails: { Title: [{ code: 'UNKNOWN_CODE', message: 'First' }, { code: 'NotEmptyValidator', message: 'Second' }], Code: [{ code: 'VALIDATION_VERIFICATION_CODE_FORMAT', message: 'Third' }] } }
    const error = createApiClientError(400, payload, 'Fallback')
    expect(Object.keys(extractBackendErrorDetails(error) ?? {})).toEqual(['Title', 'Code'])
    expect(extractBackendErrorDetails(error)).toEqual(payload.errorDetails)
    expect(error.code).toBe('UNKNOWN_CODE')
    expect(getBackendFieldError(error, 'code')).toBe('Third')
    expect(getBackendFieldError(error, 'Email')).toBeUndefined()
  })

  it('rejects malformed details while keeping legacy messages', () => {
    const payload = { errors: { Code: ['Server copy'] }, errorDetails: { Code: [{ code: 123, message: 'Server copy' }] } }
    expect(createApiClientError(400, payload, 'Fallback').code).toBeUndefined()
    expect(getBackendFieldError({ data: payload }, 'code')).toBe('Server copy')
    const { errorDetails: _details, ...legacy } = verificationValidationResponses.en
    expect(validationFailureSchema.parse(legacy)).toEqual(legacy)
  })
})
