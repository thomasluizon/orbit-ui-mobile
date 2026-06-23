import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadFile, type LocalUpload } from '@/lib/upload-file'

const { apiClientMock, fetchMock } = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: apiClientMock,
}))

vi.stubGlobal('fetch', fetchMock)

const signed = {
  key: 'user-1/abc.webp',
  signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/uploads/user-1/abc.webp?token=jwt',
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/uploads/user-1/abc.webp',
}

const localUpload: LocalUpload = {
  uri: 'file:///tmp/avatar.webp',
  contentType: 'image/webp',
  sizeBytes: 2048,
}

describe('mobile uploadFile', () => {
  beforeEach(() => {
    apiClientMock.mockReset()
    fetchMock.mockReset()
    apiClientMock.mockResolvedValue(signed)
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
  })

  it('signs through apiClient then PUTs the file to the signed url', async () => {
    const result = await uploadFile(localUpload)

    expect(apiClientMock).toHaveBeenCalledWith('/api/uploads/sign', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        contentType: 'image/webp',
        sizeBytes: 2048,
      }),
    }))
    expect(fetchMock).toHaveBeenCalledWith(signed.signedUrl, expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    }))
    expect(result).toEqual({ key: signed.key, publicUrl: signed.publicUrl })
  })

  it('throws when the upload PUT fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(uploadFile(localUpload)).rejects.toThrow(/status 500/)
  })
})
