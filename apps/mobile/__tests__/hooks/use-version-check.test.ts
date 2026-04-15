import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versionCheckKeys } from '@orbit/shared/query'

type QueryResult = {
  androidCheck: {
    shouldUpdate: boolean
    storeVersion?: string
    other?: { updatePriority?: number }
  } | null
  latestIosVersion: string | null
  iosStoreUrl: string | null
} | undefined

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as QueryResult,
    lastOptions: null as {
      queryKey: readonly unknown[]
      queryFn: () => Promise<QueryResult>
      enabled: boolean
    } | null,
    platformOS: 'android' as 'android' | 'ios' | 'web',
    version: '1.0.0' as string | undefined,
    pkg: 'org.useorbit.app' as string | undefined,
    bundleId: 'org.useorbit.app' as string | undefined,
  }

  return {
    state,
    getAppStoreLookup: vi.fn(),
    checkNeedsUpdate: vi.fn(),
    startUpdate: vi.fn(),
    installUpdate: vi.fn(),
    useQuery: vi.fn(
      (options: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<QueryResult>
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
  getAppStoreLookup: mocks.getAppStoreLookup,
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

vi.mock('sp-react-native-in-app-updates', () => {
  class MockInAppUpdates {
    checkNeedsUpdate = mocks.checkNeedsUpdate
    startUpdate = mocks.startUpdate
    installUpdate = mocks.installUpdate
  }
  return {
    default: MockInAppUpdates,
    IAUUpdateKind: { FLEXIBLE: 'flexible', IMMEDIATE: 'immediate' },
  }
})

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
        ios: { bundleIdentifier: mocks.state.bundleId },
      }
    },
  },
}))

import {
  installAndroidUpdate,
  startAndroidUpdate,
  useVersionCheck,
} from '@/hooks/use-version-check'

describe('useVersionCheck', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.state.lastOptions = null
    mocks.state.platformOS = 'android'
    mocks.state.version = '1.0.0'
    mocks.state.pkg = 'org.useorbit.app'
    mocks.state.bundleId = 'org.useorbit.app'
    mocks.getAppStoreLookup.mockReset()
    mocks.checkNeedsUpdate.mockReset()
    mocks.startUpdate.mockReset()
    mocks.installUpdate.mockReset()
    mocks.useQuery.mockClear()
  })

  it('uses a platform-scoped query key and enables on android', () => {
    useVersionCheck()
    expect(mocks.state.lastOptions?.queryKey).toEqual(
      versionCheckKeys.latest('android:org.useorbit.app'),
    )
    expect(mocks.state.lastOptions?.enabled).toBe(true)
  })

  it('reports updateAvailable=true on android when Play says shouldUpdate', () => {
    mocks.state.data = {
      androidCheck: { shouldUpdate: true, other: { updatePriority: 2 } },
      latestIosVersion: null,
      iosStoreUrl: null,
    }
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(true)
    expect(result.forceUpdate).toBe(false)
  })

  it('marks forceUpdate=true on android when updatePriority >= 4', () => {
    mocks.state.data = {
      androidCheck: { shouldUpdate: true, other: { updatePriority: 5 } },
      latestIosVersion: null,
      iosStoreUrl: null,
    }
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(true)
    expect(result.forceUpdate).toBe(true)
  })

  it('returns false on android when Play reports no update', () => {
    mocks.state.data = {
      androidCheck: { shouldUpdate: false },
      latestIosVersion: null,
      iosStoreUrl: null,
    }
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(false)
    expect(result.forceUpdate).toBe(false)
  })

  it('drives iOS update state from iTunes version comparison', () => {
    mocks.state.platformOS = 'ios'
    mocks.state.data = {
      androidCheck: null,
      latestIosVersion: '1.2.0',
      iosStoreUrl: 'https://apps.apple.com/app/id42',
    }
    const result = useVersionCheck()
    expect(result.updateAvailable).toBe(true)
    expect(result.latestVersion).toBe('1.2.0')
    expect(result.iosStoreUrl).toBe('https://apps.apple.com/app/id42')
    expect(result.forceUpdate).toBe(false)
  })

  it('invokes iTunes lookup inside the iOS queryFn', async () => {
    mocks.state.platformOS = 'ios'
    mocks.getAppStoreLookup.mockResolvedValue({
      version: '1.3.0',
      storeUrl: 'https://apps.apple.com/app/id99',
    })
    useVersionCheck()
    const response = await mocks.state.lastOptions?.queryFn()
    expect(response?.latestIosVersion).toBe('1.3.0')
    expect(response?.iosStoreUrl).toBe('https://apps.apple.com/app/id99')
    expect(mocks.getAppStoreLookup).toHaveBeenCalledWith('org.useorbit.app')
  })

  it('invokes Play Core check inside the android queryFn', async () => {
    mocks.state.platformOS = 'android'
    mocks.checkNeedsUpdate.mockResolvedValue({ shouldUpdate: true, other: { updatePriority: 3 } })
    useVersionCheck()
    const response = await mocks.state.lastOptions?.queryFn()
    expect(response?.androidCheck?.shouldUpdate).toBe(true)
    expect(mocks.checkNeedsUpdate).toHaveBeenCalledOnce()
  })
})

describe('startAndroidUpdate / installAndroidUpdate', () => {
  beforeEach(() => {
    mocks.startUpdate.mockReset()
    mocks.installUpdate.mockReset()
  })

  it('calls startUpdate with FLEXIBLE by default on android', async () => {
    mocks.state.platformOS = 'android'
    await startAndroidUpdate()
    expect(mocks.startUpdate).toHaveBeenCalledWith({ updateType: 'flexible' })
  })

  it('calls startUpdate with IMMEDIATE when forced', async () => {
    mocks.state.platformOS = 'android'
    await startAndroidUpdate({ immediate: true })
    expect(mocks.startUpdate).toHaveBeenCalledWith({ updateType: 'immediate' })
  })

  it('does nothing on iOS', async () => {
    mocks.state.platformOS = 'ios'
    await startAndroidUpdate()
    await installAndroidUpdate()
    expect(mocks.startUpdate).not.toHaveBeenCalled()
    expect(mocks.installUpdate).not.toHaveBeenCalled()
  })
})
