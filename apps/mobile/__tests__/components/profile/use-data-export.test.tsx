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

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return { ...actual, Share: { share: mocks.share } }
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
    mocks.share.mockReset().mockResolvedValue({ action: 'sharedAction' })
  })

  it('fetches the export, writes a dated cache file, and opens the share sheet', async () => {
    const harness = await renderDataExport()

    await TestRenderer.act(async () => {
      await harness.current.exportData()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.profile.export)
    expect(mocks.share).toHaveBeenCalledTimes(1)
    const shareArg = mocks.share.mock.calls[0]?.[0] as { title: string; url: string }
    expect(shareArg.title).toBe('dataExport.shareTitle')
    expect(shareArg.url).toContain('orbit-data-export-')
    expect(shareArg.url).toContain('.json')
    expect(harness.current.isExporting).toBe(false)
    expect(harness.current.exportError).toBe('')
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
    expect(harness.current.isExporting).toBe(false)
  })
})
