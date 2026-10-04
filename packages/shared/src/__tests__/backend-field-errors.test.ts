import { describe, expect, it } from 'vitest'
import { allBackendFormErrorsMapped, deriveBackendFormErrors, firstBackendFormError, resolveBackendFormFieldMessage, backendFormFieldFocusRequest, unmappedBackendFormError } from '../hooks/backend-field-errors-core'
import { verificationValidationResponses } from '../test-support/validation-fixtures'

const names = { code: 'Code', email: 'Email' }
const values = { code: '12345', email: 'validation@example.invalid' }

describe('backend form failures', () => {
  it('prefers the server copy, translates a local key, and leaves an absent error empty', () => {
    const message = verificationValidationResponses.en.errors.Code.join('\n')
    const translate = (key: string) => `Translated ${key}`
    expect(resolveBackendFormFieldMessage(message, 'auth.errors.codeFormat', translate)).toBe(message)
    expect(resolveBackendFormFieldMessage(undefined, 'auth.errors.codeFormat', translate)).toBe('Translated auth.errors.codeFormat')
    expect(resolveBackendFormFieldMessage(undefined, undefined, translate)).toBeUndefined()
  })

  it('returns a focus request only for its named field', () => {
    const field = firstBackendFormError(verificationValidationResponses.en, names)
    expect(backendFormFieldFocusRequest('code', field, 2)).toBe(2)
    expect(backendFormFieldFocusRequest('email', field, 2)).toBeUndefined()
    expect(backendFormFieldFocusRequest('code', undefined, 2)).toBeUndefined()
  })

  it('joins repeated unmapped messages in field order with case-insensitive mapping', () => {
    const english = verificationValidationResponses.en.errors.Code
    const portuguese = verificationValidationResponses['pt-BR'].errors.Code
    const error = { errors: { Code: [...english], Email: [...portuguese], Other: [...english] } }
    expect(unmappedBackendFormError(error, ['cOdE'])).toBe([...portuguese, ...english].join('\n'))
    expect(unmappedBackendFormError(error, ['code', 'EMAIL', 'Other'])).toBeUndefined()
    expect(unmappedBackendFormError(new Error('Transport failure'), [])).toBeUndefined()
  })

  it('keeps unchanged field messages and clears a corrected field', () => {
    const failure = { error: verificationValidationResponses.en, values }
    expect(deriveBackendFormErrors(failure, values, names)).toEqual({ code: verificationValidationResponses.en.errors.Code.join('\n') })
    expect(deriveBackendFormErrors(failure, { ...values, code: '123456' }, names)).toEqual({})
    expect(firstBackendFormError(failure.error, names)).toBe('code')
    expect(deriveBackendFormErrors(null, values, names)).toEqual({})
  })

  it('keeps an unmapped failure on the general error path', () => {
    const error = { errors: { Code: ['Code failure'], Other: ['Other failure'] } }
    expect(allBackendFormErrorsMapped(error, names)).toBe(false)
    expect(deriveBackendFormErrors({ error, values }, values, names)).toEqual({ code: 'Code failure' })
    expect(allBackendFormErrorsMapped(verificationValidationResponses.en, names)).toBe(true)
    expect(allBackendFormErrorsMapped(new Error('Transport failure'), names)).toBe(false)
  })
})
