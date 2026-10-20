import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReminderPermission } from '@/hooks/use-reminder-permission'

const mocks = vi.hoisted(() => ({
  push: {
    isSupported: true,
    permissionStatus: 'undetermined',
    permissionCanAskAgain: true,
    requestPermissionOutcome: vi.fn(),
  },
}))

vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => mocks.push,
}))

type PermissionResult = ReturnType<typeof useReminderPermission>
const TestRenderer = require('react-test-renderer') as {
  create: (element: React.ReactNode) => { update: (element: React.ReactNode) => void }
  act: {
    (callback: () => Promise<void>): Promise<void>
    (callback: () => void): void
  }
}

function mount(enabled: boolean, onToggle = vi.fn()) {
  let result!: PermissionResult
  function Harness({ reminderEnabled }: { reminderEnabled: boolean }) {
    result = useReminderPermission(reminderEnabled, onToggle)
    return null
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<Harness reminderEnabled={enabled} />) })
  return {
    get result() { return result },
    onToggle,
    rerender(nextEnabled: boolean) {
      TestRenderer.act(() => tree.update(<Harness reminderEnabled={nextEnabled} />))
    },
  }
}

beforeEach(() => {
  mocks.push.isSupported = true
  mocks.push.permissionStatus = 'undetermined'
  mocks.push.permissionCanAskAgain = true
  mocks.push.requestPermissionOutcome.mockReset()
  mocks.push.requestPermissionOutcome.mockResolvedValue('denied')
})

describe('useReminderPermission', () => {
  it('asks on toggle and keeps reminder state controlled by the form', () => {
    const hook = mount(false)
    expect(mocks.push.requestPermissionOutcome).not.toHaveBeenCalled()
    TestRenderer.act(() => hook.result.toggleReminder())
    expect(hook.onToggle).toHaveBeenCalledOnce()
    expect(mocks.push.requestPermissionOutcome).toHaveBeenCalledOnce()
    hook.rerender(true)
    expect(hook.result.showNotice).toBe(true)
  })

  it('skips the prompt when permission is granted', () => {
    mocks.push.permissionStatus = 'granted'
    const hook = mount(false)
    TestRenderer.act(() => hook.result.toggleReminder())
    hook.rerender(true)
    expect(hook.onToggle).toHaveBeenCalledOnce()
    expect(mocks.push.requestPermissionOutcome).not.toHaveBeenCalled()
    expect(hook.result.showNotice).toBe(false)
  })

  it('keeps a blocked reminder on without opening a system prompt', () => {
    mocks.push.permissionStatus = 'denied'
    mocks.push.permissionCanAskAgain = false
    const hook = mount(false)
    TestRenderer.act(() => hook.result.toggleReminder())
    hook.rerender(true)
    expect(hook.onToggle).toHaveBeenCalledOnce()
    expect(mocks.push.requestPermissionOutcome).not.toHaveBeenCalled()
    expect(hook.result.showNotice).toBe(true)
  })

  it('shows the settings path when the permission request fails before status loads', async () => {
    Object.assign(mocks.push, { permissionStatus: null })
    mocks.push.requestPermissionOutcome.mockResolvedValue('failed')
    const hook = mount(false)
    await TestRenderer.act(async () => {
      hook.result.toggleReminder()
      await Promise.resolve()
    })
    hook.rerender(true)
    expect(hook.onToggle).toHaveBeenCalledOnce()
    expect(hook.result.showNotice).toBe(true)
  })

  it('asks again after a refused reminder is turned off and back on', () => {
    const hook = mount(false)
    TestRenderer.act(() => hook.result.toggleReminder())
    hook.rerender(true)
    TestRenderer.act(() => hook.result.toggleReminder())
    hook.rerender(false)
    TestRenderer.act(() => hook.result.toggleReminder())
    expect(mocks.push.requestPermissionOutcome).toHaveBeenCalledTimes(2)
  })
})
