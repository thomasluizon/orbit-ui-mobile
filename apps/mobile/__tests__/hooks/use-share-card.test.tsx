import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShareCard } from '@/hooks/use-share-card'

const mocks = vi.hoisted(() => ({
  captureRef: vi.fn(),
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  pickDirectoryAsync: vi.fn(),
  copy: vi.fn(),
  reportEvent: vi.fn(),
}))

vi.mock('react-native-view-shot', () => ({ captureRef: mocks.captureRef }))
vi.mock('expo-sharing', () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  shareAsync: mocks.shareAsync,
}))
vi.mock('expo-file-system', () => ({
  Directory: {
    pickDirectoryAsync: mocks.pickDirectoryAsync,
  },
  File: class MockFile {
    readonly uri: string

    constructor(...segments: ({ uri: string } | string)[]) {
      this.uri = segments
        .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
        .join('/')
    }

    copy(destination: { uri: string }) {
      return mocks.copy(destination)
    }
  },
}))
vi.mock('@/hooks/use-gamification', () => ({ useReportEvent: () => ({ mutate: mocks.reportEvent }) }))

const TestRenderer = require('react-test-renderer')

async function renderHookValue<T>(hook: () => T): Promise<{ readonly current: T }> {
  let latest: T | null = null

  function Harness() {
    latest = hook()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  return {
    get current() {
      if (latest === null) {
        throw new Error('hook did not render')
      }
      return latest
    },
  }
}

describe('mobile useShareCard', () => {
  beforeEach(() => {
    mocks.captureRef.mockReset().mockResolvedValue('file:///cache/share-card.png')
    mocks.isAvailableAsync.mockReset().mockResolvedValue(true)
    mocks.shareAsync.mockReset().mockResolvedValue(undefined)
    mocks.pickDirectoryAsync.mockReset().mockResolvedValue({ uri: 'content://downloads' })
    mocks.copy.mockReset().mockResolvedValue(undefined)
    mocks.reportEvent.mockReset()
  })

  it('captures the card and opens the native share sheet, firing the seam once', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.share('Share progress')
    })

    expect(mocks.captureRef).toHaveBeenCalledTimes(1)
    expect(mocks.shareAsync).toHaveBeenCalledTimes(1)
    expect(mocks.shareAsync.mock.calls[0]![0]).toBe('file:///cache/share-card.png')
    expect(mocks.reportEvent).toHaveBeenCalledTimes(1)
    expect(mocks.reportEvent).toHaveBeenCalledWith('card_shared')
    expect(hook.current.hasError).toBe(false)
  })

  it('reports the unsupported state without treating it as a failed share', async () => {
    mocks.isAvailableAsync.mockResolvedValue(false)
    const hook = await renderHookValue(() => useShareCard())

    expect(hook.current.canShareFiles).toBe(false)
    expect(mocks.shareAsync).not.toHaveBeenCalled()
    expect(mocks.reportEvent).not.toHaveBeenCalled()
    expect(hook.current.hasError).toBe(false)
  })

  it('saves the composed PNG to the directory selected by the person', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(mocks.pickDirectoryAsync).toHaveBeenCalledWith()
    expect(mocks.copy).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'content://downloads/orbit-recap.png' }),
    )
    expect(mocks.reportEvent).toHaveBeenCalledWith('card_shared')
    expect(hook.current.hasError).toBe(false)
  })
})
