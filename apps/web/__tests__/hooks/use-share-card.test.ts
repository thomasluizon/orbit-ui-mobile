import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { toPngMock, reportEventMock } = vi.hoisted(() => ({
  toPngMock: vi.fn(),
  reportEventMock: vi.fn(),
}))
vi.mock('html-to-image', () => ({ toPng: toPngMock }))
vi.mock('@/hooks/use-gamification', () => ({ useReportEvent: () => ({ mutate: reportEventMock }) }))

import { useShareCard } from '@/hooks/use-share-card'

const payload = { shareTitle: 'title', shareText: 'text', url: 'https://app.useorbit.org/r/ABC123' }

let clickSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  toPngMock.mockReset().mockResolvedValue('data:image/png;base64,AAA')
  reportEventMock.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
    }),
  )
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  clickSpy.mockRestore()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('useShareCard', () => {
  it('falls back to a download when Web Share is unavailable and fires the share seam once', async () => {
    const { result } = renderHook(() => useShareCard())
    result.current.captureRef.current = document.createElement('div')

    await act(async () => {
      await result.current.share(payload)
    })

    expect(toPngMock).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(reportEventMock).toHaveBeenCalledTimes(1)
    expect(reportEventMock).toHaveBeenCalledWith('card_shared')
    expect(result.current.hasError).toBe(false)
  })

  it('shares the captured file via the Web Share API when files are supported', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })

    const { result } = renderHook(() => useShareCard())
    result.current.captureRef.current = document.createElement('div')

    await act(async () => {
      await result.current.share(payload)
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(clickSpy).not.toHaveBeenCalled()
    expect(reportEventMock).toHaveBeenCalledTimes(1)
    expect(reportEventMock).toHaveBeenCalledWith('card_shared')
  })

  it('ignores a cancelled share without erroring or awarding', async () => {
    const abort = new DOMException('cancelled', 'AbortError')
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(abort), configurable: true })

    const { result } = renderHook(() => useShareCard())
    result.current.captureRef.current = document.createElement('div')

    await act(async () => {
      await result.current.share(payload)
    })

    expect(result.current.hasError).toBe(false)
    expect(reportEventMock).not.toHaveBeenCalled()
  })
})
