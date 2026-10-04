import { describe, expect, it } from 'vitest'
import { allBackendFormErrorsMapped, deriveBackendFormErrors, firstBackendFormError } from '../hooks/backend-field-errors-core'
import { verificationValidationResponses } from '../test-support/validation-fixtures'

const names = { code: 'Code', email: 'Email' }
const values = { code: '12345', email: 'validation@example.invalid' }

describe('backend form failures', () => {
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
