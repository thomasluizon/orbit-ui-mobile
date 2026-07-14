import { describe, expect, it } from 'vitest'
import { extractAuthBackendMessage } from '../utils/auth-login'

describe('extractAuthBackendMessage', () => {
  it('reads an error string from the data envelope', () => {
    expect(extractAuthBackendMessage({ data: { error: 'Invalid verification code' } })).toBe(
      'Invalid verification code',
    )
  })

  it('reads a message field but ignores transport-level failure messages', () => {
    expect(extractAuthBackendMessage({ data: { message: 'Please slow down' } })).toBe('Please slow down')
    expect(extractAuthBackendMessage({ data: { message: 'Request failed: 500' } })).toBeUndefined()
  })

  it('pulls the first field error from an errors map', () => {
    expect(
      extractAuthBackendMessage({ data: { errors: { email: ['Invalid email format'] } } }),
    ).toBe('Invalid email format')
  })

  it('reads a nested data.data envelope', () => {
    expect(
      extractAuthBackendMessage({ data: { data: { error: 'Nested backend error' } } }),
    ).toBe('Nested backend error')
  })

  it('reads a body envelope', () => {
    expect(extractAuthBackendMessage({ body: { error: 'Body backend error' } })).toBe(
      'Body backend error',
    )
  })

  it('reads a top-level error record and returns undefined for empty values', () => {
    expect(extractAuthBackendMessage({ error: 'Top-level error' })).toBe('Top-level error')
    expect(extractAuthBackendMessage({ data: {} })).toBeUndefined()
    expect(extractAuthBackendMessage(null)).toBeUndefined()
    expect(extractAuthBackendMessage('string')).toBeUndefined()
  })
})
