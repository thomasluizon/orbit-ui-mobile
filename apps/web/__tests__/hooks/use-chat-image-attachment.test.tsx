import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent, ClipboardEvent } from 'react'

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
  useAuthStore.getState().setAuth({ userId, name: 'Thomas', email: 'thomas@example.com' })
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
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-1'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('accepts a valid pick, clears the error, and builds a preview URL', () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    act(() => {
      result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
    })

    expect(setSendError).toHaveBeenCalledWith(null)
    expect(result.current.selectedImage?.type).toBe('image/png')
    expect(result.current.imagePreview).toBe('blob:preview-1')
  })

  it('rejects an unsupported type with the type error key and keeps no selection', () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    act(() => {
      result.current.handleFileSelect(fileSelectEvent(imageFile('image/gif', 1024, 'bad.gif')))
    })

    expect(setSendError).toHaveBeenCalledWith('chat.imageError')
    expect(result.current.selectedImage).toBeNull()
    expect(result.current.imagePreview).toBeNull()
  })

  it('rejects an oversized image with the size error key', () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))

    act(() => {
      result.current.handleFileSelect(
        fileSelectEvent(imageFile('image/png', 21 * 1024 * 1024)),
      )
    })

    expect(setSendError).toHaveBeenCalledWith('chat.imageSizeError')
    expect(result.current.selectedImage).toBeNull()
  })

  it('surfaces a validation error when a pasted image is the wrong type', () => {
    const setSendError = vi.fn()
    const { result } = renderHook(() => useChatImageAttachment(setSendError))
    const event = pasteEvent(imageFile('image/gif', 2048, 'pasted.gif'), 'image/gif')

    act(() => {
      result.current.handlePaste(event)
    })

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(setSendError).toHaveBeenCalledWith('chat.imageError')
    expect(result.current.selectedImage).toBeNull()
  })

  it('revokes the preview URL when the image is removed', () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-2'),
      revokeObjectURL,
    })
    const { result } = renderHook(() => useChatImageAttachment(vi.fn()))

    act(() => {
      result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
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
    act(() => {
      result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
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
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-3'),
      revokeObjectURL,
    })
    signInAs('user-1')
    const { result } = renderHook(() => useChatImageAttachment(vi.fn()))
    act(() => {
      result.current.handleFileSelect(fileSelectEvent(imageFile('image/png', 1024)))
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
})
