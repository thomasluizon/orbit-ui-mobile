import { describe, expect, it } from 'vitest'
import { buildSupportRequestBody } from '../utils/support'

describe('buildSupportRequestBody', () => {
  it('trims fields and falls back to profile values', () => {
    expect(
      buildSupportRequestBody(
        { name: 'Orbit User', email: 'orbit@example.com' },
        {
          name: '  ',
          email: '  ',
          subject: '  Help me  ',
          message: '  The app crashed  ',
        },
      ),
    ).toEqual({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: 'Help me',
      message: 'The app crashed',
    })
  })

  it('omits empty profile fallbacks', () => {
    expect(
      buildSupportRequestBody(null, {
        name: 'Orbit',
        email: 'orbit@example.com',
        subject: 'Need help',
        message: 'Please contact me',
      }),
    ).toEqual({
      name: 'Orbit',
      email: 'orbit@example.com',
      subject: 'Need help',
      message: 'Please contact me',
    })
  })
})
