import { z } from 'zod'

export const UPLOAD_ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const UPLOAD_MAX_SIZE_BYTES = 8 * 1024 * 1024

export const SignUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(UPLOAD_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_SIZE_BYTES),
})

export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>

export const SignUploadResponseSchema = z.object({
  key: z.string().min(1),
  signedUrl: z.string().url(),
  publicUrl: z.string().url(),
})

export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>
