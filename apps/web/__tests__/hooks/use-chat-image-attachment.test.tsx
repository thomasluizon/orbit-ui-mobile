import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent, ClipboardEvent } from 'react'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { useChatImageAttachment } from '@/hooks/use-chat-image-attachment'
import { useAuthStore } from '@/stores/auth-store'

const sessionFetch = vi.fn()

function imageFile(type: string, sizeBytes: number, name = 'photo.png'): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

function fileSelectEvent(file: File | undefined): ChangeEvent<HTMLInputElement> {
  return {
    target: { files: file ? [file] : [], value: 'preset' },
  } as unknown as ChangeEvent<HTMLInputElement>
}

function signInAs(userId: string) {
  useAuthStore.getState().setAuth({ userId, name: 'Alex', email: 'alex@example.com' })
}

function answerSessionWith(session: { expiresAt: number; userId: string }) {
  sessionFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ...session, refreshFailed: false }),
  })
}

function refuseSessionRefresh() {
  sessionFetch.mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ refreshFailed: true }),
  })
}

function pasteEvent(file: File | null, type: string): ClipboardEvent<HTMLTextAreaElement> {
  const preventDefault = vi.fn()
  return {
    preventDefault,
    clipboardData: {
      items: [{ type, getAsFile: () => file }],
    },
  } as unknown as ClipboardEvent<HTMLTextAreaElement>
}

describe('useChatImageAttachment', () => {
  beforeEach(() => {
    sessionFetch.mockReset()
    vi.stubGlobal('fetch', sessionFetch)
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve({ width: 640, height: 480, close: vi.fn() })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) { callback(new Blob(['resized'], { type: 'image/jpeg' })) })
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:preview-1'),
      revokeObjectURL: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('accepts a valid pick, clears the error, and builds a preview URL', async () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    await act(async () => {
      await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
    })

    expect(setSendError).toHaveBeenCalledWith(null)
    expect(result.current.selectedImage?.type).toBe('image/jpeg')
    expect(result.current.imagePreview).toBe('blob:preview-1')
  })

  it('rejects an unsupported type with the type error key and keeps no selection', async () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    await act(async () => {
      await result.current.handleFileSelect(fileSelectEvent(imageFile('image/gif', 1024, 'bad.gif')))
    })

    expect(setSendError).toHaveBeenCalledWith('chat.imageError')
    expect(result.current.selectedImage).toBeNull()
    expect(result.current.imagePreview).toBeNull()
  })

  it('rejects an oversized image with the size error key', async () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    await act(async () => {
      await result.current.handleFileSelect(
        fileSelectEvent(imageFile('image/png', 21 * 1024 * 1024)),
      )
    })

    expect(setSendError).toHaveBeenCalledWith('chat.imageSizeError')
    expect(result.current.selectedImage).toBeNull()
  })

  it('surfaces a validation error when a pasted image is the wrong type', async () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))
    const event = pasteEvent(imageFile('image/gif', 2048, 'pasted.gif'), 'image/gif')

    await act(async () => {
      await result.current.handlePaste(event)
    })

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(setSendError).toHaveBeenCalledWith('chat.imageError')
    expect(result.current.selectedImage).toBeNull()
  })

  it('revokes the preview URL when the image is removed', async () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:preview-2'),
      revokeObjectURL,
    }))
    const { result } = renderHook(() => useChatImageAttachment(vi.fn()))

    await act(async () => {
      await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
    })
    expect(result.current.imagePreview).toBe('blob:preview-2')

    act(() => {
      result.current.removeImage()
    })

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
    expect(result.current.selectedImage).toBeNull()
    expect(result.current.imagePreview).toBeNull()
  })

  it('drops the previous account image when another account replaces it', async () => {
    signInAs('user-1')
    const { result } = renderHook(() => useChatImageAttachment(vi.fn()))
    await act(async () => {
      await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
    })
    expect(result.current.selectedImage).not.toBeNull()

    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-2' })
      await useAuthStore.getState().checkSession()
    })

    expect(result.current.selectedImage).toBeNull()
    expect(result.current.imagePreview).toBeNull()
  })

  it('keeps the image when the same account recovers from a rejected refresh', async () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:preview-3'),
      revokeObjectURL,
    }))
    signInAs('user-1')
    const { result } = renderHook(() => useChatImageAttachment(vi.fn()))
    await act(async () => {
      await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
    })
    const preview = result.current.imagePreview

    await act(async () => {
      refuseSessionRefresh()
      await useAuthStore.getState().confirmSessionRefreshFailure()
    })
    expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
      await useAuthStore.getState().recoverSessionRefreshFailure()
    })

    expect(result.current.selectedImage).not.toBeNull()
    expect(result.current.imagePreview).toBe(preview)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

it('reports decode failure without selecting the original file', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Decode failed')))
  const setError = vi.fn()
  const { result } = renderHook(() => useChatImageAttachment(setError))
  await act(async () => { await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024))) })
  expect(setError).toHaveBeenCalledWith('chat.imageError')
  expect(result.current.selectedImage).toBeNull()
})

it('validates the encoded output size', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([new Uint8Array(21 * 1024 * 1024)], { type: 'image/jpeg' })))
  const setError = vi.fn()
  const { result } = renderHook(() => useChatImageAttachment(setError))
  await act(async () => { await result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024))) })
  expect(setError).toHaveBeenCalledWith('chat.imageSizeError')
  expect(result.current.selectedImage).toBeNull()
})

it('discards a resize completed after the attachment was removed', async () => {
  let finish!: (bitmap: { width: number; height: number; close: () => void }) => void
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<{ width: number; height: number; close: () => void }>(resolve => { finish = resolve })))
  const { result } = renderHook(() => useChatImageAttachment(vi.fn()))
  let selecting!: Promise<void>
  await act(async () => { selecting = result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024))) })
  await act(async () => {
    result.current.removeImage()
    finish({ width: 640, height: 480, close: vi.fn() })
    await selecting
  })
  expect(result.current.selectedImage).toBeNull()
  expect(result.current.imagePreview).toBeNull()
})

})
