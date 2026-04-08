import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TIME_FORMAT_STORAGE_KEY } from '@orbit/shared/utils'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const storage: Record<string, string> = {}

  return {
    storage,
    getItem: vi.fn((key: string) => Promise.resolve(storage[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value
      return Promise.resolve()
    }),
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}))

import { formatTime, useTimeFormat } from '@/hooks/use-time-format'

async function renderUseTimeFormat(): Promise<ReturnType<typeof useTimeFormat>> {
  let latestValue: ReturnType<typeof useTimeFormat> | null = null

  function Harness() {
    latestValue = useTimeFormat()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
    await Promise.resolve()
  })

  if (!latestValue) {
    throw new Error('useTimeFormat did not render')
  }

  return latestValue
}

describe('mobile useTimeFormat', () => {
  beforeEach(() => {
    Object.keys(mocks.storage).forEach((key) => delete mocks.storage[key])
    mocks.getItem.mockClear()
    mocks.setItem.mockClear()
  })

  it('formats times through the shared formatter', () => {
    expect(formatTime('14:30', '12h')).toBe('2:30 PM')
  })

  it('hydrates the saved format from async storage', async () => {
    mocks.storage[TIME_FORMAT_STORAGE_KEY] = '12h'

    const result = await renderUseTimeFormat()

    expect(result.currentFormat).toBe('12h')
    expect(mocks.getItem).toHaveBeenCalledWith(TIME_FORMAT_STORAGE_KEY)
  })

  it('persists updates back to async storage', async () => {
    const result = await renderUseTimeFormat()

    await TestRenderer.act(async () => {
      result.setFormat('12h')
      await Promise.resolve()
    })

    expect(result.currentFormat).toBe('12h')
    expect(mocks.setItem).toHaveBeenCalledWith(TIME_FORMAT_STORAGE_KEY, '12h')
  })
})
