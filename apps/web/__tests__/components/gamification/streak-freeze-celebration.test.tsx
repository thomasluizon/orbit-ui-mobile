import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { currentStreak: 47 } }),
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: () => 'May 21' }),
}))

import { StreakFreezeCelebration } from '@/components/gamification/streak-freeze-celebration'
import type { StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'

describe('StreakFreezeCelebration', () => {
  it('renders nothing initially', () => {
    const ref = React.createRef<StreakFreezeCelebrationHandle>()
    const { container } = render(<StreakFreezeCelebration ref={ref} />)
    expect(container.innerHTML).toBe('')
  })

  it('exposes show() via ref', () => {
    const ref = React.createRef<StreakFreezeCelebrationHandle>()
    render(<StreakFreezeCelebration ref={ref} />)
    expect(ref.current?.show).toBeTypeOf('function')
  })
})
