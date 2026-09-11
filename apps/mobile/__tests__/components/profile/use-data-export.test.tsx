import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { useDataExport } from '@/app/(tabs)/profile/_components/use-data-export'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  isOnline: true,
  apiClient: vi.fn(),
  share: vi.fn(),
}))

vi.mock('expo-sharing', () => {
  return { shareAsync: mocks.share }
})

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))

type DataExportApi = ReturnType<typeof useDataExport>

async function renderDataExport(): Promise<{ current: DataExportApi }> {
  const ref: { current: DataExportApi | null } = { current: null }

  function Harness() {
    ref.current = useDataExport()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Harness))
    await Promise.resolve()
  })

  if (!ref.current) throw new Error('useDataExport did not render')
  return ref as { current: DataExportApi }
}

describe('mobile useDataExport', () => {
  beforeEach(() => {
    mocks.isOnline = true
    mocks.apiClient.mockReset().mockResolvedValue({ habits: [], goals: [] })
    mocks.share.mockReset().mockResolvedValue(undefined)
  })

  it('fetches the export, writes a dated cache file, and opens the share sheet', async () => {
    const harness = await renderDataExport()

    await TestRenderer.act(async () => {
      await harness.current.exportData()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.profile.export)
    expect(mocks.share).toHaveBeenCalledTimes(1)
    const shareUri = mocks.share.mock.calls[0]?.[0] as string
    const shareOptions = mocks.share.mock.calls[0]?.[1] as Record<string, string>
    expect(shareUri).toContain('orbit-data-export-')
    expect(shareUri).toContain('.json')
    expect(shareOptions).toEqual({
      dialogTitle: 'dataExport.shareTitle',
      mimeType: 'application/json',
    })
    expect(harness.current.isExporting).toBe(false)
    expect(harness.current.exportDone).toBe(true)
    expect(harness.current.exportError).toBe('')

    TestRenderer.act(() => harness.current.clearExportDone())
    expect(harness.current.exportDone).toBe(false)
  })

  it('blocks the export and surfaces the offline error without hitting the API', async () => {
    mocks.isOnline = false
    const harness = await renderDataExport()

    await TestRenderer.act(async () => {
      await harness.current.exportData()
    })

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.share).not.toHaveBeenCalled()
    expect(harness.current.exportError).toBe('errors.offline')
    expect(harness.current.exportDone).toBe(false)
    expect(harness.current.isExporting).toBe(false)
  })

  it('surfaces the export error copy and never shares when the API request fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('boom'))
    const harness = await renderDataExport()

    await TestRenderer.act(async () => {
      await harness.current.exportData()
    })

    expect(mocks.share).not.toHaveBeenCalled()
    expect(harness.current.exportError).toBe('dataExport.error')
    expect(harness.current.exportDone).toBe(false)
    expect(harness.current.isExporting).toBe(false)
  })
})
