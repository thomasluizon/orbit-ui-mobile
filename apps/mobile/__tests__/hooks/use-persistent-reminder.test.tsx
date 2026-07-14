import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'
import { usePersistentReminder } from '@/hooks/use-persistent-reminder'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  syncWidgetData: vi.fn(),
  cancelPersistentReminder: vi.fn(),
  isPersistentReminderSupported: vi.fn(),
  requestPersistentReminderPermission: vi.fn(),
}))

vi.mock('@/lib/orbit-widget', () => ({
  syncWidgetData: mocks.syncWidgetData,
}))

vi.mock('@/lib/persistent-reminder', () => ({
  cancelPersistentReminder: mocks.cancelPersistentReminder,
  isPersistentReminderSupported: mocks.isPersistentReminderSupported,
  requestPersistentReminderPermission: mocks.requestPersistentReminderPermission,
}))

interface Holder {
  current: ReturnType<typeof usePersistentReminder>
}

function renderReminder(): Holder {
  const holder = { current: null as unknown as ReturnType<typeof usePersistentReminder> }
  function Harness() {
    holder.current = usePersistentReminder()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  return holder
}

describe('mobile usePersistentReminder', () => {
  beforeEach(() => {
    mocks.syncWidgetData.mockReset().mockResolvedValue(undefined)
    mocks.cancelPersistentReminder.mockReset().mockResolvedValue(undefined)
    mocks.isPersistentReminderSupported.mockReset().mockReturnValue(true)
    mocks.requestPersistentReminderPermission.mockReset().mockResolvedValue(true)
    usePersistentReminderStore.setState({ enabled: false })
  })

  it('reflects platform support from the reminder library', () => {
    mocks.isPersistentReminderSupported.mockReturnValue(false)
    const hook = renderReminder()
    expect(hook.current.isSupported).toBe(false)
  })

  it('enabling requests permission, persists the flag, and posts off the widget feed', async () => {
    const hook = renderReminder()

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(mocks.requestPersistentReminderPermission).toHaveBeenCalledTimes(1)
    expect(usePersistentReminderStore.getState().enabled).toBe(true)
    expect(mocks.syncWidgetData).toHaveBeenCalledTimes(1)
    expect(mocks.cancelPersistentReminder).not.toHaveBeenCalled()
  })

  it('leaves the reminder off and skips the widget sync when permission is denied', async () => {
    mocks.requestPersistentReminderPermission.mockResolvedValue(false)
    const hook = renderReminder()

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(usePersistentReminderStore.getState().enabled).toBe(false)
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
  })

  it('disabling clears the flag and dismisses the notification without a widget sync', async () => {
    usePersistentReminderStore.setState({ enabled: true })
    const hook = renderReminder()

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(usePersistentReminderStore.getState().enabled).toBe(false)
    expect(mocks.cancelPersistentReminder).toHaveBeenCalledTimes(1)
    expect(mocks.requestPersistentReminderPermission).not.toHaveBeenCalled()
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
  })

  it('still enables when the widget sync rejects (best-effort post)', async () => {
    mocks.syncWidgetData.mockRejectedValue(new Error('widget unavailable'))
    const hook = renderReminder()

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(usePersistentReminderStore.getState().enabled).toBe(true)
    expect(mocks.syncWidgetData).toHaveBeenCalledTimes(1)
  })

  it('still disables when dismissing the notification rejects', async () => {
    usePersistentReminderStore.setState({ enabled: true })
    mocks.cancelPersistentReminder.mockRejectedValue(new Error('dismiss failed'))
    const hook = renderReminder()

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(usePersistentReminderStore.getState().enabled).toBe(false)
    expect(mocks.cancelPersistentReminder).toHaveBeenCalledTimes(1)
  })

  it('ignores a re-entrant toggle while a toggle is already in flight', async () => {
    let resolvePermission: (granted: boolean) => void = () => {}
    mocks.requestPersistentReminderPermission.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolvePermission = resolve
      }),
    )
    const hook = renderReminder()

    let firstToggle: Promise<void> = Promise.resolve()
    await TestRenderer.act(async () => {
      firstToggle = hook.current.toggle()
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      await hook.current.toggle()
    })

    expect(mocks.requestPersistentReminderPermission).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      resolvePermission(true)
      await firstToggle
    })

    expect(usePersistentReminderStore.getState().enabled).toBe(true)
  })
})
