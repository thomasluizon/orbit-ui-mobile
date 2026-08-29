import { describe, expect, it } from 'vitest'
import {
  getChatImageValidationError,
  resolveChatImageMimeType,
  stripChatDirectives,
} from '../chat'
import { hasComposerContent } from '../contracts/composer'

describe('hasComposerContent', () => {
  it.each(['', ' ', '\t\n'])('rejects blank composer content %j', (content) => {
    expect(hasComposerContent(content)).toBe(false)
  })

  it('accepts visible composer content surrounded by whitespace', () => {
    expect(hasComposerContent('  log my walk  ')).toBe(true)
  })
})

describe('resolveChatImageMimeType', () => {
  it('prefers the provided mime type', () => {
    expect(resolveChatImageMimeType({ mimeType: 'IMAGE/PNG' })).toBe('image/png')
  })

  it('infers the mime type from the file name when mime type is missing', () => {
    expect(resolveChatImageMimeType({ name: 'habit-photo.JPG' })).toBe('image/jpeg')
  })

  it('falls back to inferring from the uri', () => {
    expect(resolveChatImageMimeType({ uri: 'file:///tmp/preview.webp' })).toBe('image/webp')
  })
})

describe('getChatImageValidationError', () => {
  it('accepts supported images under the size limit', () => {
    expect(
      getChatImageValidationError({
        mimeType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).toBeNull()
  })

  it('rejects unsupported image types', () => {
    expect(
      getChatImageValidationError({
        mimeType: 'image/gif',
        fileSize: 1024,
      }),
    ).toBe('type')
  })

  it('rejects images above the max size', () => {
    expect(
      getChatImageValidationError({
        mimeType: 'image/png',
        fileSize: 21 * 1024 * 1024,
      }),
    ).toBe('size')
  })
})

describe('stripChatDirectives', () => {
  it.each([
    '[',
    '[[',
    '[[o',
    '[[or',
    '[[orb',
    '[[orbi',
    '[[orbit',
    '[[orbit:',
    '[[orbit:goals',
    '[[orbit:goals]',
    '[[orbit:goals]]',
  ])('hides a trailing streamed directive prefix %j', (directivePrefix) => {
    expect(stripChatDirectives(`Here are your goals:\n${directivePrefix}`, true)).toBe(
      'Here are your goals:',
    )
  })

  it('preserves a trailing partial prefix after streaming ends', () => {
    expect(stripChatDirectives('Use a literal [')).toBe('Use a literal [')
    expect(stripChatDirectives('Use a literal [[or')).toBe('Use a literal [[or')
  })

  it('leaves non-directive bracketed text visible', () => {
    expect(stripChatDirectives('Use [square brackets] here')).toBe('Use [square brackets] here')
  })
})
