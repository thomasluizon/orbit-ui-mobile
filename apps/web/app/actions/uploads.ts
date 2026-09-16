'use server'

import type { SignUploadRequest, SignUploadResponse } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function signUpload(
  input: SignUploadRequest,
): Promise<ServerActionResult<SignUploadResponse>> {
  return wrapServerAction(() => serverAuthFetch(API.uploads.sign, {
    method: 'POST',
    body: JSON.stringify(input),
  }))
}
