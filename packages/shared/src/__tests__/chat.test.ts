import { describe, expect, it } from 'vitest'
import {
  buildChatMessageWithFileContent,
  getChatImageValidationError,
  getChatTextFileValidationError,
  resolveChatImageMimeType,
} from '../chat'

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
  it('accepts supported text files under the size limit, case-insensitively', () => {
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

  it('rejects unsupported or extension-less files', () => {
    expect(getChatTextFileValidationError({ name: 'photo.png', fileSize: 2048 })).toBe('type')
    expect(getChatTextFileValidationError({ name: 'report.pdf', fileSize: 2048 })).toBe('type')
    expect(getChatTextFileValidationError({ name: 'noextension', fileSize: 2048 })).toBe('type')
  })

  it('rejects text files above the max size', () => {
    expect(getChatTextFileValidationError({ name: 'huge.csv', fileSize: 2 * 1024 * 1024 })).toBe(
      'size',
    )
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
