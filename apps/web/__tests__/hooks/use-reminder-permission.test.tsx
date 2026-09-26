import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReminderPermission } from '@/hooks/use-reminder-permission'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  supported: vi.fn(() => true),
}))

vi.mock('@/hooks/use-push-notification-preferences', () => ({
  ensurePushSubscription: mocks.subscribe,
  isPushNotificationSupported: mocks.supported,
}))

beforeEach(() => {
  mocks.subscribe.mockReset()
  mocks.supported.mockReturnValue(true)
  vi.stubGlobal('Notification', { permission: 'default' })
})

describe('useReminderPermission', () => {
  it('asks only when a person turns on a reminder and keeps the toggle independent', async () => {
    const onToggle = vi.fn()
    mocks.subscribe.mockResolvedValue({ permission: 'denied' })
    const { result, rerender } = renderHook(
      ({ enabled }) => useReminderPermission(enabled, onToggle),
      { initialProps: { enabled: false } },
    )
    expect(mocks.subscribe).not.toHaveBeenCalled()
    act(() => result.current.toggleReminder())
    expect(onToggle).toHaveBeenCalledOnce()
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.showNotice).toBe(true))
  })

  it('registers without prompting when permission is granted', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    mocks.subscribe.mockResolvedValue({ permission: 'granted' })
    const onToggle = vi.fn()
    const { result, rerender } = renderHook(
      ({ enabled }) => useReminderPermission(enabled, onToggle),
      { initialProps: { enabled: false } },
    )
    act(() => result.current.toggleReminder())
    rerender({ enabled: true })
    expect(onToggle).toHaveBeenCalledOnce()
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    expect(result.current.showNotice).toBe(false)
  })

  it('uses the settings path when the browser has blocked prompts', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    const onToggle = vi.fn()
    const { result, rerender } = renderHook(
      ({ enabled }) => useReminderPermission(enabled, onToggle),
      { initialProps: { enabled: false } },
    )
    act(() => result.current.toggleReminder())
    rerender({ enabled: true })
    expect(onToggle).toHaveBeenCalledOnce()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(result.current.showNotice).toBe(true)
  })

  it('asks again after the reminder is turned off and back on', () => {
    mocks.subscribe.mockResolvedValue({ permission: 'default' })
    const { result, rerender } = renderHook(
      ({ enabled }) => useReminderPermission(enabled, vi.fn()),
      { initialProps: { enabled: false } },
    )
    act(() => result.current.toggleReminder())
    rerender({ enabled: true })
    act(() => result.current.toggleReminder())
    rerender({ enabled: false })
    act(() => result.current.toggleReminder())
    expect(mocks.subscribe).toHaveBeenCalledTimes(2)
  })
})
