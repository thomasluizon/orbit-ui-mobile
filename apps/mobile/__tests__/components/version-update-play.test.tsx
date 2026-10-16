import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

interface TestNode {
  type: unknown
  props: { children?: unknown; title?: string; onClick?: () => void }
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}
interface TestTree { root: TestNode; unmount: () => void }
const TestRenderer: {
  create: (element: React.ReactNode) => TestTree
  act: (callback: () => void | Promise<void>) => Promise<void>
} = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  installedBuild: '140',
  installedVersion: '1.3.81',
  offeredBuild: 141,
  priority: 2,
  downloaded: false,
  readDownloaded: vi.fn<() => Promise<boolean>>(),
  checkNeedsUpdate: vi.fn(),
  startUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getItem: vi.fn<() => Promise<string | null>>(),
  setItem: vi.fn(),
  resumeListeners: new Set<(state: string) => void>(),
  nativeListeners: new Map<string, Set<(event: unknown) => void>>(),
}))

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mocks.installedVersion },
  get nativeBuildVersion() { return mocks.installedBuild },
}))
vi.mock('react-native-device-info', () => ({ getVersion: () => mocks.installedVersion }))
vi.mock('expo', async (importOriginal) => ({
  ...await importOriginal<typeof import('expo')>(),
  requireNativeModule: () => ({ isUpdateDownloaded: mocks.readDownloaded }),
}))
vi.mock('react-native', async () => ({
  ...await import('../../test-mocks/react-native'),
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.resumeListeners.add(listener)
      return { remove: () => mocks.resumeListeners.delete(listener) }
    },
  },
  NativeModules: {
    SpInAppUpdates: {
      IN_APP_UPDATE_STATUS_KEY: 'in_app_update_status',
      IN_APP_UPDATE_RESULT_KEY: 'in_app_update_result',
      checkNeedsUpdate: mocks.checkNeedsUpdate,
      startUpdate: mocks.startUpdate,
      installUpdate: mocks.installUpdate,
      setStatusUpdateSubscription: vi.fn(),
    },
  },
  NativeEventEmitter: class {
    addListener(name: string, listener: (event: unknown) => void) {
      const listeners = mocks.nativeListeners.get(name) ?? new Set()
      listeners.add(listener)
      mocks.nativeListeners.set(name, listeners)
      return { remove: () => listeners.delete(listener) }
    }
  },
}))
vi.mock('sp-react-native-in-app-updates', async () => {
  const android = await vi.importActual<{ default: typeof import('sp-react-native-in-app-updates')['default'] }>('sp-react-native-in-app-updates/src/InAppUpdates.android')
  const types = await import('../../../../node_modules/sp-react-native-in-app-updates/src/types')
  return {
    default: android.default,
    IAUInstallStatus: types.AndroidInstallStatus,
    IAUUpdateKind: types.AndroidUpdateType,
  }
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: mocks.getItem, setItem: mocks.setItem },
}))

let tree: TestTree | undefined
let queryClient: QueryClient

async function flushQueries() {
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10) })
}
async function mount() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<QueryClientProvider client={queryClient}><VersionUpdateDrawer /></QueryClientProvider>)
  })
  await flushQueries()
}
async function unmount() {
  await TestRenderer.act(() => { tree?.unmount() })
  tree = undefined
  queryClient.clear()
}
function sheetTitles() {
  return tree?.root.findAll((node) => node.type === 'Sheet').map((node) => node.props.title)
}
async function press(label: string) {
  const action = tree?.root.findAll((node) => typeof node.props.onClick === 'function' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0).at(-1)
  if (!action) throw new Error(`Missing action: ${label}`)
  await TestRenderer.act(() => { action.props.onClick?.() })
  await TestRenderer.act(() => { sheetTestControls.completeDismissal() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.installedBuild = '140'
  mocks.installedVersion = '1.3.81'
  mocks.offeredBuild = 141
  mocks.priority = 2
  mocks.downloaded = false
  mocks.resumeListeners.clear()
  mocks.nativeListeners.clear()
  mocks.readDownloaded.mockImplementation(() => Promise.resolve(mocks.downloaded))
  mocks.getItem.mockResolvedValue(null)
  mocks.setItem.mockResolvedValue(undefined)
  mocks.startUpdate.mockResolvedValue(undefined)
  mocks.checkNeedsUpdate.mockImplementation(() => Promise.resolve({
    updateAvailability: 2,
    isImmediateUpdateAllowed: true,
    isFlexibleUpdateAllowed: true,
    updatePriority: mocks.priority,
    dayStaleness: 1,
    versionCode: mocks.offeredBuild,
    packageName: 'org.useorbit.app.staging',
    totalBytes: 100,
  }))
  sheetTestControls.defer(true)
})
afterEach(async () => {
  await unmount()
  sheetTestControls.defer(false)
  vi.useRealTimers()
})

describe('Play update sheet selection', () => {
  it('shows no sheet when Play offers the installed version code', async () => {
    mocks.offeredBuild = 140
    await mount()
    expect(sheetTitles()).toEqual([])
  })
  it('shows the store sheet for a higher version code regardless of the version name', async () => {
    mocks.installedVersion = '200.0.0'
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
  })
  it('shows no sheet for a lower version code', async () => {
    mocks.offeredBuild = 139
    await mount()
    expect(sheetTitles()).toEqual([])
  })
  it('shows the restart sheet for an already downloaded flexible update', async () => {
    mocks.downloaded = true
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.readyTitle'])
    await press('versionUpdate.restartCta')
    expect(mocks.installUpdate).toHaveBeenCalledOnce()
    expect(mocks.startUpdate).not.toHaveBeenCalled()
  })
  it('rechecks Play on resume while the version query is still fresh', async () => {
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
    mocks.downloaded = true
    await TestRenderer.act(() => {
      for (const listener of mocks.resumeListeners) listener('active')
    })
    await flushQueries()
    expect(sheetTitles()).toEqual(['versionUpdate.readyTitle'])
    expect(mocks.startUpdate).not.toHaveBeenCalled()
    await unmount()
    expect(mocks.resumeListeners.size).toBe(0)
  })
  it('shows no sheet after completing an update and launching the offered build', async () => {
    mocks.downloaded = true
    await mount()
    await press('versionUpdate.restartCta')
    await unmount()
    mocks.installedBuild = '141'
    mocks.downloaded = false
    await mount()
    expect(sheetTitles()).toEqual([])
    expect(mocks.startUpdate).not.toHaveBeenCalled()
  })
  it('keeps the Android store snooze for 24 hours across launches', async () => {
    await mount()
    await press('versionUpdate.laterCta')
    const snoozedUntil = Date.now() + 24 * 60 * 60 * 1000
    expect(mocks.setItem).toHaveBeenCalledWith('orbit:version-update-snoozed-until', String(snoozedUntil))
    mocks.getItem.mockResolvedValue(String(snoozedUntil))
    await unmount()
    await mount()
    expect(sheetTitles()).toEqual([])
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000) })
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
  })
  it.each([4, 5])('starts an immediate update at priority %s despite a snooze', async (priority) => {
    mocks.priority = priority
    mocks.getItem.mockResolvedValue(String(Date.now() + 24 * 60 * 60 * 1000))
    await mount()
    expect(sheetTitles()).toEqual([])
    expect(mocks.startUpdate).toHaveBeenCalledExactlyOnceWith(1)
  })
  it('offers a restart for a downloaded high priority update', async () => {
    mocks.downloaded = true
    mocks.priority = 5
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.readyTitle'])
    expect(mocks.startUpdate).not.toHaveBeenCalled()
  })
  it('shows no store sheet if Play install status cannot be read', async () => {
    mocks.readDownloaded.mockRejectedValue(new Error('Play unavailable'))
    await mount()
    expect(sheetTitles()).toEqual([])
  })
  it.each(['', 'unknown', '1.3.81', '0'])('never uses the version name when the build code is %s', async (build) => {
    mocks.installedBuild = build
    await mount()
    expect(sheetTitles()).toEqual([])
    expect(mocks.checkNeedsUpdate).not.toHaveBeenCalled()
  })

})
