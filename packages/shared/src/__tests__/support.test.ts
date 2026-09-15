import { describe, expect, it } from 'vitest'
import {
  attachSupportVersion,
  buildSupportRequestBody,
  buildSupportVersionSuffix,
  getSupportMessageFit,
  getSupportMessageMaxLength,
  getSupportSendReasonKey,
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

describe('support version metadata', () => {
  it('reserves the suffix bytes and appends the version once', () => {
    const message = 'm'.repeat(4987)

    expect(buildSupportVersionSuffix('0.0.1')).toBe('\n\nOrbit 0.0.1')
    expect(getSupportMessageMaxLength('0.0.1')).toBe(4987)
    expect(attachSupportVersion(message, '0.0.1')).toBe(`${message}\n\nOrbit 0.0.1`)
  })

  it('counts UTF-16 code units and leaves messages unchanged without a version', () => {
    expect(getSupportMessageMaxLength('v❤')).toBe(4990)
    expect(getSupportMessageMaxLength(undefined)).toBe(5000)
    expect(attachSupportVersion('Message', undefined)).toBe('Message')
  })

  it('reports whether the trimmed message plus version fits the API limit', () => {
    expect(getSupportMessageFit(`${'m'.repeat(4987)}   `, '0.0.1')).toEqual({
      fits: true,
      overage: 0,
    })
    expect(getSupportMessageFit('m'.repeat(5000), '0.0.1')).toEqual({
      fits: false,
      overage: 13,
    })
  })

  it('names the active reason a support request cannot send', () => {
    expect(getSupportSendReasonKey({
      hasMessage: true,
      hasSubject: true,
      isOnline: true,
      isSending: false,
      messageFits: false,
    })).toBe('profile.support.sendNeedsShorterMessage')
    expect(getSupportSendReasonKey({
      hasMessage: false,
      hasSubject: true,
      isOnline: true,
      isSending: false,
      messageFits: true,
    })).toBe('profile.support.sendNeedsMessage')
  })
})
