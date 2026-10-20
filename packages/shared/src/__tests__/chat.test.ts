import { describe, expect, it } from 'vitest'
import {
  buildChatMessageWithFileContent,
  getChatImageValidationError,
  getChatTextFileValidationError,
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

  it('accepts a text file without typed content but still rejects an image alone', () => {
    expect(hasComposerContent('', [{ id: 'file', kind: 'file', name: 'habits.csv' }])).toBe(true)
    expect(hasComposerContent('', [{ id: 'image', kind: 'image', name: 'walk.png' }])).toBe(false)
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

describe('getChatTextFileValidationError', () => {
  it('accepts supported text files under the size limit case insensitively', () => {
    expect(getChatTextFileValidationError({ name: 'habits.csv', fileSize: 2048 })).toBeNull()
    expect(getChatTextFileValidationError({ name: 'export.JSON', fileSize: 2048 })).toBeNull()
    expect(getChatTextFileValidationError({ name: 'notes.md', fileSize: 2048 })).toBeNull()
    expect(getChatTextFileValidationError({ name: 'list.txt', fileSize: 2048 })).toBeNull()
  })

  it('infers the allowed extension from the uri when the name is missing', () => {
    expect(
      getChatTextFileValidationError({ uri: 'file:///tmp/export.csv', fileSize: 2048 }),
    ).toBeNull()
  })

  it('rejects unsupported or extensionless files', () => {
    expect(getChatTextFileValidationError({ name: 'photo.png', fileSize: 2048 })).toBe('type')
    expect(getChatTextFileValidationError({ name: 'report.pdf', fileSize: 2048 })).toBe('type')
    expect(getChatTextFileValidationError({ name: 'noextension', fileSize: 2048 })).toBe('type')
  })

  it('accepts exactly 1 MiB and rejects one byte more', () => {
    expect(getChatTextFileValidationError({ name: 'limit.csv', fileSize: 1024 * 1024 })).toBeNull()
    expect(
      getChatTextFileValidationError({ name: 'over-limit.csv', fileSize: 1024 * 1024 + 1 }),
    ).toBe('size')
  })
})

describe('buildChatMessageWithFileContent', () => {
  it('appends the file block beneath the typed message', () => {
    expect(
      buildChatMessageWithFileContent({
        message: 'Import these please',
        fileLabel: 'Attached file "habits.csv":',
        fileContent: 'Run\nRead',
      }),
    ).toBe('Import these please\n\nAttached file "habits.csv":\nRun\nRead')
  })

  it('returns only the file block when no message is typed', () => {
    expect(
      buildChatMessageWithFileContent({
        message: '   ',
        fileLabel: 'Attached file "list.txt":',
        fileContent: 'Meditate',
      }),
    ).toBe('Attached file "list.txt":\nMeditate')
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
