import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReminderPermission } from '@/hooks/use-reminder-permission'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  supported: vi.fn(() => true),
  devices: { count: 0 as number | undefined, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false },
}))

vi.mock('@/hooks/use-push-subscriptions', () => ({ usePushSubscriptions: () => mocks.devices }))

vi.mock('@/hooks/use-push-notification-preferences', () => ({
  ensurePushSubscription: mocks.subscribe,
  isPushNotificationSupported: mocks.supported,
}))

beforeEach(() => {
  Object.assign(mocks.devices, { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false })
  mocks.subscribe.mockReset().mockResolvedValue({ permission: 'default' })
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

  it.each(['denied', 'granted'])('does not ask again after a %s answer', async (permission) => {
    mocks.subscribe.mockImplementation(async () => {
      vi.stubGlobal('Notification', { permission })
      return { permission }
    })
    const { result, rerender } = renderHook(({ enabled }) => useReminderPermission(enabled, vi.fn()), { initialProps: { enabled: false } })
    act(() => result.current.toggleReminder())
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce())
    rerender({ enabled: true })
    act(() => result.current.toggleReminder())
    rerender({ enabled: false })
    if (permission === 'denied') {
      act(() => result.current.toggleReminder())
      expect(mocks.subscribe).toHaveBeenCalledOnce()
    }
  })

  it.each(['full', 'loading', 'failed'])('never prompts or registers when the device list is %s', (state) => {
    Object.assign(mocks.devices, { count: state === 'full' ? 5 : undefined, isLoading: state === 'loading', isError: state === 'failed' })
    const { result } = renderHook(() => useReminderPermission(false, vi.fn()))
    act(() => result.current.toggleReminder())
    expect(mocks.subscribe).not.toHaveBeenCalled()
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
