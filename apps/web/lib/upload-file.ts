import {
  SignUploadResponseSchema,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  type SignUploadResponse,
} from '@orbit/shared'
import { signUpload } from '@/app/actions/uploads'

export type StoredFile = Pick<SignUploadResponse, 'key' | 'publicUrl'>

type AllowedContentType = (typeof UPLOAD_ALLOWED_CONTENT_TYPES)[number]

function assertAllowedContentType(contentType: string): asserts contentType is AllowedContentType {
  if (!(UPLOAD_ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }
}

/**
 * Signs an upload server-side, PUTs the file straight to object storage,
 * and returns only the stored key + public URL to persist.
 */
export async function uploadFile(file: File): Promise<StoredFile> {
  assertAllowedContentType(file.type)

  const signed = SignUploadResponseSchema.parse(
    await signUpload({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  )

  const response = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }

  return { key: signed.key, publicUrl: signed.publicUrl }
}
