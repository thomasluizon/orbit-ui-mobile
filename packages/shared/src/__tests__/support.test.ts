import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
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
  it('takes contact fields only from the profile', () => {
    expect(buildSupportRequestBody(
      { name: ' Orbit User ', email: ' orbit@example.com ' },
      { subject: '  Help me  ', message: '  The app crashed  ' },
    )).toEqual({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: 'Help me',
      message: 'The app crashed',
    })
  })
})

describe('support copy', () => {
  it('keeps the form labels, validation, and reply reason aligned in both locales', () => {
    expect(en.profile.support).toMatchObject({
      description: 'Tell us what happened. The more concrete it is, the faster we can fix it.',
      message: 'What happened',
      email: 'Reply to',
      emailLockedReason: 'Managed by your account.',
      subjectRequired: 'Pick a subject so we can route it properly.',
      messageRequired: 'Write at least one sentence about what happened.',
    })
    expect(ptBR.profile.support).toMatchObject({
      description: 'Conte o que aconteceu. Quanto mais concreto, mais rápido a gente resolve.',
      message: 'O que aconteceu',
      email: 'Resposta para',
      emailLockedReason: 'Gerido pela sua conta.',
      subjectRequired: 'Escolha um assunto para a gente encaminhar certo.',
      messageRequired: 'Escreva pelo menos uma frase sobre o que aconteceu.',
    })
    for (const support of [en.profile.support, ptBR.profile.support]) {
      for (const removed of [
        'name', 'namePlaceholder', 'nameRequired', 'emailPlaceholder', 'emailRequired', 'emailInvalid',
      ]) {
        expect(support).not.toHaveProperty(removed)
      }
    }
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
      hasProfile: true,
      hasSubject: true,
      isOnline: true,
      isSending: false,
      messageFits: false,
    })).toBe('profile.support.sendNeedsShorterMessage')
    expect(getSupportSendReasonKey({
      hasMessage: false,
      hasProfile: true,
      hasSubject: true,
      isOnline: true,
      isSending: false,
      messageFits: true,
    })).toBe('profile.support.sendNeedsMessage')
    expect(getSupportSendReasonKey({
      hasMessage: true, hasProfile: false, hasSubject: true,
      isOnline: true, isSending: false, messageFits: true,
    })).toBe('profile.support.sendNeedsProfile')
  })
})
