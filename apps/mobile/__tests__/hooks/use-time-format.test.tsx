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

let uses24HourClock: boolean | undefined = true

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: uses24HourClock === undefined ? undefined : { uses24HourClock } }),
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
  it.each([
    [true, 'h23'],
    [false, 'h12'],
  ] as const)('formats time using the server-resolved clock setting %s', async (uses24Hour, hourCycle) => {
    uses24HourClock = uses24Hour
    const result = await renderUseTimeFormat()

    expect(result.displayTime('14:30')).toBe(
      formatLocaleTime('14:30', 'en', { hour: 'numeric', minute: '2-digit', hourCycle }),
    )
  })

  it('does not assume a clock setting before the profile resolves', async () => {
    uses24HourClock = undefined
    const result = await renderUseTimeFormat()

    expect(result.displayTime('14:30')).toBe('')
  })

  it('returns an empty string for missing values', async () => {
    const result = await renderUseTimeFormat()

    expect(result.displayTime(null)).toBe('')
    expect(result.displayTime(undefined)).toBe('')
  })
})
