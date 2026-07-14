import { describe, it, expect, vi, beforeEach } from 'vitest'
import { API } from '@orbit/shared/api'
import type { SignUploadRequest } from '@orbit/shared'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const { signUpload } = await import('@/app/actions/uploads')

describe('uploads server action', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  it('requests a signed upload and returns the response', async () => {
    const input: SignUploadRequest = { contentType: 'image/png', sizeBytes: 1024 }
    mockServerAuthFetch.mockResolvedValue({
      key: 'k',
      signedUrl: 'https://s3/put',
      publicUrl: 'https://cdn/k',
    })

    const result = await signUpload(input)

    expect(result).toEqual({ key: 'k', signedUrl: 'https://s3/put', publicUrl: 'https://cdn/k' })
    expect(mockServerAuthFetch).toHaveBeenCalledWith(API.uploads.sign, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  })
})
