import { useState } from 'react'
import type { SQLInputValue } from 'node:sqlite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMascotMotionSwitch } from '@/hooks/use-mascot-motion'
import { cancelScheduledFlush } from '@/lib/offline-mutations'
import { claimLegacyAccount, clear, getAll } from '@/lib/offline-queue'

const queueMocks = vi.hoisted(() => ({
  apiClient: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getCurrentConnectivity: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } }))
vi.mock('@/lib/api-client', () => ({ apiClient: queueMocks.apiClient }))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'account-a' }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: queueMocks.getCurrentConnectivity }))
vi.mock('@/lib/query-client', () => ({ persistQueryCache: vi.fn(), queryClient: { invalidateQueries: vi.fn(() => Promise.resolve()), getQueriesData: () => [] } }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/stores/offline-sync-store', () => ({ useOfflineSyncStore: { getState: () => ({ addDrop: vi.fn() }) } }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }), subscribe: () => () => {} },
}))

const { database } = await vi.hoisted(async () => {
  const { DatabaseSync } = await import('node:sqlite')
  return { database: new DatabaseSync(':memory:') }
})
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => database.exec(sql),
    runSync: (sql: string, params: SQLInputValue[] = []) => { database.prepare(sql).run(...params) },
    getAllSync: (sql: string, params: SQLInputValue[] = []) => database.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: SQLInputValue[] = []) => database.prepare(sql).get(...params) ?? null,
    withTransactionSync: (task: () => void) => {
      database.exec('BEGIN')
      try { task(); database.exec('COMMIT') } catch (error) { database.exec('ROLLBACK'); throw error }
    },
  }),
}))

const TestRenderer = require('react-test-renderer')

afterEach(() => {
  cancelScheduledFlush()
  clear()
})

describe('the Orbit em movimento switch offline on Android', () => {
  it('applies two toggles at once and queues one write that carries the last value', async () => {
    claimLegacyAccount('account-a')
    let control: ReturnType<typeof useMascotMotionSwitch> | undefined
    function Harness() {
      const [profile, setProfile] = useState<Profile>(createMockProfile({ mascotMotionEnabled: true }))
      control = useMascotMotionSwitch(profile, (patch) => setProfile((current) => ({ ...current, ...patch })))
      return null
    }
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    let tree: { unmount(): void } | undefined
    TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>) })
    await TestRenderer.act(async () => { control!.toggle(); await Promise.resolve() })
    expect(control!.enabled).toBe(false)
    await vi.waitFor(() => expect(getAll().filter((mutation) => mutation.type === 'setMascotMotion')).toHaveLength(1))
    await TestRenderer.act(async () => { control!.toggle(); await Promise.resolve() })
    expect(control!.enabled).toBe(true)
    await vi.waitFor(() => expect(getAll().filter((mutation) => mutation.type === 'setMascotMotion')).toMatchObject([
      { endpoint: API.profile.mascotMotion, method: 'PUT', payload: { enabled: true }, dedupeKey: 'profile-mascot-motion' },
    ]))
    expect(queueMocks.apiClient).not.toHaveBeenCalled()
    TestRenderer.act(() => tree?.unmount())
    queryClient.clear()
  })
})
