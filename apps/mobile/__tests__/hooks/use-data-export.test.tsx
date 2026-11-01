import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { File } from 'expo-file-system'
import { afterEach, expect, it, vi } from 'vitest'
import { useDataExport } from '@/app/(tabs)/profile/_components/use-data-export'

const mocks = vi.hoisted(() => ({ share: vi.fn().mockResolvedValue(undefined) }))
vi.mock('expo-sharing', () => ({ shareAsync: mocks.share }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn().mockResolvedValue({}) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

afterEach(() => { vi.restoreAllMocks(); mocks.share.mockClear() })

it('shares the export only after the asynchronous file write completes', async () => {
  let finishWrite!: () => void
  const write = vi.spyOn(File.prototype, 'write').mockReturnValue(new Promise<void>((resolve) => { finishWrite = resolve }))
  let current!: ReturnType<typeof useDataExport>
  function Harness() { current = useDataExport(); return null }
  let tree!: TestRenderer.ReactTestRenderer
  await act(() => { tree = TestRenderer.create(<Harness />) })
  let exporting!: Promise<void>
  try {
    await act(async () => { exporting = current.exportData(); await Promise.resolve() })
    expect(write).toHaveBeenCalledOnce()
    expect(mocks.share).not.toHaveBeenCalled()
    expect(current.isExporting).toBe(true)
    await act(async () => { finishWrite(); await exporting })
    expect(mocks.share).toHaveBeenCalledOnce()
    expect(current.exportDone).toBe(true)
  } finally {
    await act(async () => { finishWrite(); await exporting; tree.unmount() })
  }
})
