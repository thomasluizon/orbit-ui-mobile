'use server'

import type { SignUploadRequest, SignUploadResponse } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function signUpload(
  input: SignUploadRequest, intendedAccountId: string | null
): Promise<ServerActionResult<SignUploadResponse>> {
  return wrapServerAction(() => serverAuthMutate(API.uploads.sign, {
    method: 'POST',
    body: JSON.stringify(input),
  }, intendedAccountId))
}
