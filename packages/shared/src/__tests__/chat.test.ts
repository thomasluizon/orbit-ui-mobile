import { describe, expect, it } from 'vitest'
import {
  getChatImageValidationError,
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
