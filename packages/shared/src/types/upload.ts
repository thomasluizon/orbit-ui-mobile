import { z } from 'zod'
import { utf16Length } from '../validation/utf16-length'

export const UPLOAD_ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const UPLOAD_MAX_SIZE_BYTES = 8 * 1024 * 1024

export const SignUploadRequestSchema = z.object({
  contentType: z.enum(UPLOAD_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_SIZE_BYTES),
})

export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>

export const SignUploadResponseSchema = z.object({
  key: z.string().check(utf16Length('min', 1)),
  signedUrl: z.url(),
  publicUrl: z.url(),
})

export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>

export type StoredFile = Pick<SignUploadResponse, 'key' | 'publicUrl'>
