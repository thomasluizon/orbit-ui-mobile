import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'

import { useTimeFormat } from '@/hooks/use-time-format'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
  }),
}))

async function renderUseTimeFormat(): Promise<ReturnType<typeof useTimeFormat>> {
  const latestValueHolder: { current: ReturnType<typeof useTimeFormat> | null } =
    { current: null }

  function Harness() {
    latestValueHolder.current = useTimeFormat()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!latestValueHolder.current) {
    throw new Error('useTimeFormat did not render')
  }

  return latestValueHolder.current
}

describe('mobile useTimeFormat', () => {
  it('formats time using the active locale', async () => {
    const result = await renderUseTimeFormat()

    expect(result.displayTime('14:30')).toBe(formatLocaleTime('14:30', 'en'))
  })

  it('returns an empty string for missing values', async () => {
    const result = await renderUseTimeFormat()

    expect(result.displayTime(null)).toBe('')
    expect(result.displayTime(undefined)).toBe('')
  })
})
