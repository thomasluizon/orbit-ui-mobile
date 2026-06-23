import { File } from 'expo-file-system'
import {
  SignUploadResponseSchema,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  type SignUploadResponse,
} from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { apiClient } from './api-client'

export type StoredFile = Pick<SignUploadResponse, 'key' | 'publicUrl'>

export interface LocalUpload {
  uri: string
  contentType: (typeof UPLOAD_ALLOWED_CONTENT_TYPES)[number]
  sizeBytes: number
}

/**
 * Signs an upload through the API, PUTs the local file straight to object
 * storage via its signed URL, and returns only the stored key + public URL.
 */
export async function uploadFile(upload: LocalUpload): Promise<StoredFile> {
  const signed = SignUploadResponseSchema.parse(
    await apiClient<SignUploadResponse>(API.uploads.sign, {
      method: 'POST',
      body: JSON.stringify({
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
      }),
    }),
  )

  const response = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': upload.contentType, 'x-upsert': 'true' },
    body: new File(upload.uri),
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }

  return { key: signed.key, publicUrl: signed.publicUrl }
}
