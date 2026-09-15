import { describe, expect, it } from 'vitest'
import {
  buildSupportRequestBody,
  normalizeSupportSubjectId,
  SUPPORT_SUBJECT_OPTIONS,
} from '../utils/support'

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

describe('support subject options', () => {
  it('keeps the four authored choices in their shipping order', () => {
    expect(SUPPORT_SUBJECT_OPTIONS.map((option) => option.id)).toEqual([
      'problem',
      'billing',
      'account',
      'other',
    ])
  })

  it('restores known choices and maps legacy free text to the catch-all choice', () => {
    expect(normalizeSupportSubjectId('billing')).toBe('billing')
    expect(normalizeSupportSubjectId('Old free-text subject')).toBe('other')
    expect(normalizeSupportSubjectId('   ')).toBeNull()
    expect(normalizeSupportSubjectId(null)).toBeNull()
  })
})
