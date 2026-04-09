import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versionCheckKeys } from '@orbit/shared/query'

const mocks = vi.hoisted(() => {
  const state = {
    data: null as string | null,
    lastOptions: null as {
      queryKey: readonly unknown[]
      queryFn: () => Promise<string | null>
      enabled: boolean
    } | null,
    platformOS: 'android' as 'android' | 'ios' | 'web',
    version: '1.0.0' as string | undefined,
    pkg: 'org.useorbit.app' as string | undefined,
  }

  return {
    state,
    getPlayStoreVersion: vi.fn(),
    useQuery: vi.fn(
      (options: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<string | null>
        enabled: boolean
      }) => {
        state.lastOptions = options
        return { data: state.data, isLoading: false, isError: false, error: null }
      },
    ),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/version-check', () => ({
  getPlayStoreVersion: mocks.getPlayStoreVersion,
  isVersionOutdated: (current: string, latest: string) => {
    const parse = (v: string) =>
      (v.split(/[^0-9.]/)[0] ?? '')
        .split('.')
        .map((n) => Number.parseInt(n, 10) || 0)
    const a = parse(current)
    const b = parse(latest)
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const x = a[i] ?? 0
      const y = b[i] ?? 0
      if (x < y) return true
      if (x > y) return false
    }
    return false
  },
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.state.platformOS
    },
  },
}))

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return {
        version: mocks.state.version,
        android: { package: mocks.state.pkg },
      }
    },
  },
}))

import { useVersionCheck } from '@/hooks/use-version-check'

describe('useVersionCheck', () => {
  beforeEach(() => {
    mocks.state.data = null
    mocks.state.lastOptions = null
    mocks.state.platformOS = 'android'
    mocks.state.version = '1.0.0'
    mocks.state.pkg = 'org.useorbit.app'
    mocks.getPlayStoreVersion.mockReset()
    mocks.useQuery.mockClear()
  })

  it('uses the shared version-check query key and enables the fetch on android', () => {
    useVersionCheck()
    expect(mocks.state.lastOptions?.queryKey).toEqual(
      versionCheckKeys.latest('org.useorbit.app'),
    )
    expect(mocks.state.lastOptions?.enabled).toBe(true)
  })

  it('reports updateAvailable=true when a newer version is returned', () => {
    mocks.state.data = '1.0.1'
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(true)
    expect(result.latestVersion).toBe('1.0.1')
    expect(result.currentVersion).toBe('1.0.0')
  })

  it('reports updateAvailable=false when versions match', () => {
    mocks.state.data = '1.0.0'
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(false)
  })

  it('is disabled on non-android platforms', () => {
    mocks.state.platformOS = 'ios'
    mocks.state.data = '2.0.0'
    const result = useVersionCheck()
    expect(mocks.state.lastOptions?.enabled).toBe(false)
    expect(result.updateAvailable).toBe(false)
  })

  it('reports updateAvailable=false when the store fetch returns null', async () => {
    mocks.getPlayStoreVersion.mockResolvedValue(null)
    mocks.state.data = null
    const result = useVersionCheck()

    const response = await mocks.state.lastOptions?.queryFn()
    expect(response).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })
})
