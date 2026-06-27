import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'

const asyncStorageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageState.data.delete(key)
    }),
  },
}))

describe('persistent reminder store', () => {
  beforeEach(() => {
    asyncStorageState.data.clear()
    usePersistentReminderStore.setState({ enabled: false })
  })

  afterEach(() => {
    asyncStorageState.data.clear()
  })

  it('defaults the ongoing reminder to off', () => {
    expect(usePersistentReminderStore.getState().enabled).toBe(false)
  })

  it('flips the flag through setEnabled', () => {
    usePersistentReminderStore.getState().setEnabled(true)
    expect(usePersistentReminderStore.getState().enabled).toBe(true)

    usePersistentReminderStore.getState().setEnabled(false)
    expect(usePersistentReminderStore.getState().enabled).toBe(false)
  })

  it('rehydrates a previously enabled flag from storage', async () => {
    asyncStorageState.data.set(
      'orbit-persistent-reminder',
      JSON.stringify({ state: { enabled: true }, version: 0 }),
    )

    await usePersistentReminderStore.persist.rehydrate()

    expect(usePersistentReminderStore.getState().enabled).toBe(true)
  })
})
