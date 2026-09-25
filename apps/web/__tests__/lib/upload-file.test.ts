import { describe, it, expect, vi, beforeEach } from 'vitest'

const signUploadMock = vi.fn()
let heldAccountId: string | null = 'account-a'
let accountGeneration = 1
vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => heldAccountId,
  getAccountGeneration: () => accountGeneration,
}))
vi.mock('@/lib/actions/uploads', () => ({
  signUpload: signUploadMock,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { uploadFile } = await import('@/lib/upload-file')

const signed = {
  key: 'user-1/abc.png',
  signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/uploads/user-1/abc.png?token=jwt',
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/uploads/user-1/abc.png',
}

function makeFile(type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type })
}

describe('web uploadFile', () => {
  beforeEach(() => {
    heldAccountId = 'account-a'
    accountGeneration = 1
    signUploadMock.mockReset()
    fetchMock.mockReset()
    signUploadMock.mockResolvedValue(signed)
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
  })

  it('signs with file metadata then PUTs the file to the signed url', async () => {
    const file = makeFile()

    const result = await uploadFile(file)

    expect(signUploadMock).toHaveBeenCalledWith({
      contentType: 'image/png',
      sizeBytes: file.size,
    })
    expect(fetchMock).toHaveBeenCalledWith(signed.signedUrl, expect.objectContaining({
      method: 'PUT',
      body: file,
    }))
    expect(result).toEqual({ key: signed.key, publicUrl: signed.publicUrl })
  })

  it('rejects a disallowed content type before signing', async () => {
    await expect(uploadFile(makeFile('application/pdf'))).rejects.toThrow(/Unsupported content type/)
    expect(signUploadMock).not.toHaveBeenCalled()
  })

  it('throws when the upload PUT fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(uploadFile(makeFile())).rejects.toThrow(/status 500/)
  })

  it('does not PUT to an old account signed URL after an account switch', async () => {
    let finishSigning: (value: typeof signed) => void = () => {}
    signUploadMock.mockReturnValue(new Promise<typeof signed>((resolve) => { finishSigning = resolve }))

    const upload = uploadFile(makeFile())
    heldAccountId = 'account-b'
    accountGeneration++
    finishSigning(signed)

    await expect(upload).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still sends an upload when no account was held', async () => {
    heldAccountId = null

    await expect(uploadFile(makeFile())).resolves.toMatchObject({ key: signed.key })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
