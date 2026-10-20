import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlipAlertSection } from '@/components/habits/habit-form-fields/slip-alert-section'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('SlipAlertSection', () => {
  const t = ((key: string) => key) as never

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes a free account to upgrade without toggling', () => {
    const onToggle = vi.fn()
    render(
      <SlipAlertSection
        hasProAccess={false}
        slipAlertEnabled={false}
        onToggle={onToggle}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('lets a Pro account toggle the real switch', () => {
    const onToggle = vi.fn()
    render(
      <SlipAlertSection
        hasProAccess
        slipAlertEnabled={false}
        onToggle={onToggle}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('switch'))

    expect(onToggle).toHaveBeenCalledOnce()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
