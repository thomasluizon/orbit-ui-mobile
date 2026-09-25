import {
  createApiClientError,
  SignUploadResponseSchema,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  type StoredFile,
} from '@orbit/shared'
import { signUpload } from '@/lib/actions/uploads'
import { captureAccountIntent } from '@/lib/client-action'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'

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
  const intent = captureAccountIntent()
  const contentType = file.type

  const signed = SignUploadResponseSchema.parse(
    await intent.run(() => signUpload({
      contentType,
      sizeBytes: file.size,
    })),
  )
  if (!intent.stillCurrent()) {
    throw createApiClientError(409, {
      error: 'Account changed', errorCode: ACCOUNT_CHANGED_ERROR_CODE,
    }, 'Account changed')
  }

  const response = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }
  if (!intent.stillCurrent()) {
    throw createApiClientError(409, {
      error: 'Account changed', errorCode: ACCOUNT_CHANGED_ERROR_CODE,
    }, 'Account changed')
  }

  return { key: signed.key, publicUrl: signed.publicUrl }
}
