'use server'

import type { SignUploadRequest, SignUploadResponse } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function signUpload(input: SignUploadRequest): Promise<SignUploadResponse> {
  return serverAuthFetch(API.uploads.sign, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
