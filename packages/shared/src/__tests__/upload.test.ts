import { describe, it, expect } from 'vitest'
import { API } from '../api/endpoints'
import { uploadKeys } from '../query/keys'
import {
  SignUploadRequestSchema,
  SignUploadResponseSchema,
  UPLOAD_MAX_SIZE_BYTES,
} from '../types/upload'

describe('upload contract', () => {
  it('exposes the sign endpoint', () => {
    expect(API.uploads.sign).toBe('/api/uploads/sign')
  })

  it('builds the sign mutation key', () => {
    expect(uploadKeys.sign()).toEqual(['uploads', 'sign'])
  })

  describe('SignUploadRequestSchema', () => {
    it('accepts an allowed image under the size cap', () => {
      const parsed = SignUploadRequestSchema.safeParse({
        filename: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects a disallowed content type', () => {
      const parsed = SignUploadRequestSchema.safeParse({
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      })
      expect(parsed.success).toBe(false)
    })

    it('rejects a file over the size cap', () => {
      const parsed = SignUploadRequestSchema.safeParse({
        filename: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: UPLOAD_MAX_SIZE_BYTES + 1,
      })
      expect(parsed.success).toBe(false)
    })

    it('rejects a non-positive size', () => {
      const parsed = SignUploadRequestSchema.safeParse({
        filename: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: 0,
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('SignUploadResponseSchema', () => {
    it('parses a well-formed response', () => {
      const parsed = SignUploadResponseSchema.parse({
        key: 'user/file.png',
        signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/uploads/user/file.png?token=jwt',
        publicUrl: 'https://project.supabase.co/storage/v1/object/public/uploads/user/file.png',
      })
      expect(parsed.key).toBe('user/file.png')
    })

    it('rejects a non-URL signed url', () => {
      const parsed = SignUploadResponseSchema.safeParse({
        key: 'user/file.png',
        signedUrl: 'not-a-url',
        publicUrl: 'https://project.supabase.co/x',
      })
      expect(parsed.success).toBe(false)
    })
  })
})
