import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShareCard } from '@/hooks/use-share-card'
import { expoFileSystemMock } from '@/test-mocks/expo-file-system'

const mocks = vi.hoisted(() => ({
  captureRef: vi.fn(),
  open: vi.fn(),
  reportEvent: vi.fn(),
}))

vi.mock('react-native-view-shot', () => ({ captureRef: mocks.captureRef }))
vi.mock('react-native-share', () => ({ default: { open: mocks.open } }))
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
    mocks.open.mockReset().mockResolvedValue({ success: true, message: 'OK' })
    mocks.reportEvent.mockReset()
    expoFileSystemMock.reset()
  })

  it('captures the card and opens the native share sheet, firing the seam once', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.share({
        shareTitle: 'Share progress',
        shareText: 'I am building better habits',
        url: 'https://app.useorbit.org/r/ABC123?recap=week',
      })
    })

    expect(mocks.captureRef).toHaveBeenCalledTimes(1)
    expect(mocks.open).toHaveBeenCalledWith({
      title: 'Share progress',
      message: 'I am building better habits https://app.useorbit.org/r/ABC123?recap=week',
      url: 'file:///cache/share-card.png',
      type: 'image/png',
      failOnCancel: false,
    })
    expect(mocks.reportEvent).toHaveBeenCalledTimes(1)
    expect(mocks.reportEvent).toHaveBeenCalledWith('card_shared')
    expect(hook.current.hasError).toBe(false)
  })

  it('reports native share support when its open API is present', async () => {
    const hook = await renderHookValue(() => useShareCard())

    expect(hook.current.canShareFiles).toBe(true)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.reportEvent).not.toHaveBeenCalled()
    expect(hook.current.hasError).toBe(false)
  })

  it('saves the composed PNG to the directory selected by the person', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(expoFileSystemMock.createFileCalls).toEqual([])
    expect(expoFileSystemMock.copyCalls).toEqual([
      {
        sourceUri: 'file:///cache/share-card.png',
        destinationUri: 'file:///cache/orbit-recap.png',
        destinationKind: 'file',
        resultingUri: 'file:///cache/orbit-recap.png',
        options: { overwrite: true },
      },
      {
        sourceUri: 'file:///cache/orbit-recap.png',
        destinationUri: 'content://downloads',
        destinationKind: 'directory',
        resultingUri: 'content://mock-document/1',
        options: { overwrite: true },
      },
    ])
    expect([...expoFileSystemMock.directoryFiles.get('content://downloads')?.entries() ?? []])
      .toEqual([['orbit-recap.png', 'content://mock-document/1']])
    expect(mocks.reportEvent).toHaveBeenCalledWith('card_shared')
    expect(hook.current.hasError).toBe(false)
    expect(hook.current.savedFileName).toBe('orbit-recap.png')
  })

  it('leaves picker cancellation neutral without reporting a share', async () => {
    expoFileSystemMock.cancelNextDirectoryPick()
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(expoFileSystemMock.copyCalls).toEqual([])
    expect(mocks.reportEvent).not.toHaveBeenCalled()
    expect(hook.current.hasError).toBe(false)
  })

  it('overwrites the fixed file when the same directory is selected again', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
      await hook.current.download()
    })

    expect(expoFileSystemMock.createFileCalls).toEqual([])
    expect(expoFileSystemMock.copyCalls).toHaveLength(4)
    const containerCopies = expoFileSystemMock.copyCalls.filter(
      ({ destinationKind }) => destinationKind === 'directory',
    )
    expect(containerCopies).toEqual([
      {
        sourceUri: 'file:///cache/orbit-recap.png',
        destinationUri: 'content://downloads',
        destinationKind: 'directory',
        resultingUri: 'content://mock-document/1',
        options: { overwrite: true },
      },
      {
        sourceUri: 'file:///cache/orbit-recap.png',
        destinationUri: 'content://downloads',
        destinationKind: 'directory',
        resultingUri: 'content://mock-document/2',
        options: { overwrite: true },
      },
    ])
    expect([...expoFileSystemMock.directoryFiles.get('content://downloads')?.entries() ?? []])
      .toEqual([['orbit-recap.png', 'content://mock-document/2']])
    expect(mocks.reportEvent).toHaveBeenCalledTimes(2)
    expect(hook.current.hasError).toBe(false)
  })

  it('still reports a non-cancellation download failure', async () => {
    expoFileSystemMock.failNextCopy(new Error('storage unavailable'))
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(mocks.reportEvent).not.toHaveBeenCalled()
    expect(hook.current.hasError).toBe(true)
    expect(hook.current.savedFileName).toBeNull()
  })

  it('clears a previous save when the next directory pick is cancelled', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })
    expect(hook.current.savedFileName).toBe('orbit-recap.png')

    expoFileSystemMock.cancelNextDirectoryPick()
    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(hook.current.savedFileName).toBeNull()
    expect(hook.current.hasError).toBe(false)
  })

  it('clears a previous save when the next download fails', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })
    expect(hook.current.savedFileName).toBe('orbit-recap.png')

    expoFileSystemMock.failNextCopy(new Error('storage unavailable'))
    await TestRenderer.act(async () => {
      await hook.current.download()
    })

    expect(hook.current.savedFileName).toBeNull()
    expect(hook.current.hasError).toBe(true)
  })

  it('clears a previous save when the next share hands the file to the system', async () => {
    const hook = await renderHookValue(() => useShareCard())

    await TestRenderer.act(async () => {
      await hook.current.download()
    })
    expect(hook.current.savedFileName).toBe('orbit-recap.png')

    await TestRenderer.act(async () => {
      await hook.current.share({
        shareTitle: 'Share progress',
        shareText: 'I am building better habits',
        url: 'https://app.useorbit.org/r/ABC123?recap=week',
      })
    })

    expect(mocks.open).toHaveBeenCalledTimes(1)
    expect(hook.current.savedFileName).toBeNull()
    expect(hook.current.hasError).toBe(false)
  })
})
