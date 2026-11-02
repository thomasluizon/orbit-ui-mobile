import React from 'react'
import { CodedError } from 'expo-modules-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import * as Sentry from '@sentry/react-native'
import { captureAndroidUpdateCheck, captureAndroidUpdateSheetShown } from '@/lib/posthog'
import { Sheet } from '@/components/ui/sheet'

vi.unmock('@/components/ui/sheet')

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
  present: vi.fn<() => Promise<void>>(),
  completeDismissal: () => {},
  resumeListeners: new Set<(state: string) => void>(),
  nativeListeners: new Map<string, Set<(event: unknown) => void>>(),
}))

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{
    children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode
    onDidPresent?: () => void; onDidDismiss?: () => void
  }> {
    async present() {
      await mocks.present()
      this.props.onDidPresent?.()
    }
    dismiss() {
      return new Promise<void>((resolve) => {
        mocks.completeDismissal = () => { this.props.onDidDismiss?.(); resolve() }
      })
    }
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))

vi.mock('@/lib/posthog', () => ({
  captureAndroidUpdateCheck: vi.fn(),
  captureAndroidUpdateSheetShown: vi.fn(),
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
  const types = await import('sp-react-native-in-app-updates/src/types')
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
  return tree?.root.findAll((node) => node.type === Sheet).map((node) => node.props.title)
}
async function press(label: string) {
  const action = tree?.root.findAll((node) => typeof node.props.onClick === 'function' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0).at(-1)
  if (!action) throw new Error(`Missing action: ${label}`)
  await TestRenderer.act(() => { action.props.onClick?.() })
  await TestRenderer.act(() => { mocks.completeDismissal() })
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
  mocks.present.mockReset().mockResolvedValue(undefined)
  mocks.completeDismissal = () => {}
})
afterEach(async () => {
  await unmount()
  vi.useRealTimers()
})

describe('Play update sheet selection', () => {
  it('records the sheet only after native presentation completes', async () => {
    let completePresentation!: () => void
    mocks.present.mockImplementation(() => new Promise((resolve) => { completePresentation = resolve }))
    await mount()
    expect(mocks.present).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await TestRenderer.act(() => completePresentation())
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140,
    })
  })
  it('does not record another presentation when the offered version changes on the mounted sheet', async () => {
    await mount()
    mocks.offeredBuild = 142
    await TestRenderer.act(() => {
      for (const listener of mocks.resumeListeners) listener('active')
    })
    await flushQueries()
    expect(captureAndroidUpdateCheck).toHaveBeenLastCalledWith(expect.objectContaining({ available_version_code: 142 }))
    expect(mocks.present).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140,
    })
  })
  it('does not record a sheet when native presentation rejects', async () => {
    mocks.present.mockRejectedValue(new Error('VIEW_NOT_FOUND'))
    await mount()
    expect(mocks.present).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    expect(sheetTitles()).toEqual([])
  })
  it('records the Play result once per check and the sheet once per presentation', async () => {
    await mount()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'success', play_status: 2, available_version_code: 141,
      installed_version_code: 140, play_error_code: null,
    })
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140,
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledOnce()
    await TestRenderer.act(() => {
      for (const listener of mocks.resumeListeners) listener('active')
    })
    await flushQueries()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledTimes(2)
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledOnce()
  })
  it('records concurrent Play service bind failures without reporting either to Sentry or retrying', async () => {
    const error = new Error('m9.E: Failed to bind to the service.')
    mocks.checkNeedsUpdate.mockRejectedValue(error)
    mocks.readDownloaded.mockRejectedValue(error)
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: null,
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.checkNeedsUpdate).toHaveBeenCalledOnce()
    expect(mocks.readDownloaded).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledOnce()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(sheetTitles()).toEqual([])
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
  })
  it.each([
    [-3, 'The API is not available on this device.'],
    [-9, 'The Play Store app is either not installed or not the official version.'],
  ] as const)('records unavailable Play service code %s without reporting it to Sentry or retrying', async (code, message) => {
    const error = new Error(`com.google.android.play.core.install.InstallException: Install Error(${code}): ${message}`)
    mocks.checkNeedsUpdate.mockRejectedValue(error)
    mocks.readDownloaded.mockRejectedValue(error)
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.checkNeedsUpdate).toHaveBeenCalledOnce()
    expect(mocks.readDownloaded).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledOnce()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(sheetTitles()).toEqual([])
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
  })
  it.each([-2, -4, -5, -6, -7, -10, -100, -90, null])('reports unexpected Play failure code %s once without retrying', async (code) => {
    const message = code === null ? 'Unexpected Play failure' : `Install Error(${code}): unexpected failure`
    mocks.checkNeedsUpdate.mockRejectedValue(new Error(message))
    await mount()
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: `sp-react-native-in-app-updates checkNeedsUpdate error: Error: ${message}` }),
      { tags: { operation: 'android_update_check' }, extra: { installed_version_code: 140, play_error_code: code } },
    )
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'error', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.checkNeedsUpdate).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledOnce()
    expect(Sentry.captureException).toHaveBeenCalledOnce()
    expect(sheetTitles()).toEqual([])
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
  })
  it('records an unavailable Play result without inventing a store version', async () => {
    mocks.checkNeedsUpdate.mockResolvedValue({
      updateAvailability: 1, isImmediateUpdateAllowed: false, isFlexibleUpdateAllowed: false,
      updatePriority: 0, versionCode: 140, packageName: 'org.useorbit.app.staging', totalBytes: 0,
    })
    await mount()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'success', play_status: 1, available_version_code: 140,
      installed_version_code: 140, play_error_code: null,
    })
    expect(sheetTitles()).toEqual([])
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
  })
  it('does not snooze versionCode 181 after snoozing 180 in the same session', async () => {
    mocks.offeredBuild = 180
    await mount()
    await press('versionUpdate.laterCta')
    expect(sheetTitles()).toEqual([])
    mocks.offeredBuild = 181
    await TestRenderer.act(() => {
      for (const listener of mocks.resumeListeners) listener('active')
    })
    await flushQueries()
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
  })
  it('does not let a stored snooze for versionCode 180 hide 181', async () => {
    mocks.offeredBuild = 181
    mocks.getItem.mockResolvedValue(JSON.stringify({ versionCode: '180', until: Date.now() + 86_400_000 }))
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
  })
  it('expires the legacy untyped Android snooze', async () => {
    mocks.getItem.mockResolvedValue(String(Date.now() + 86_400_000))
    await mount()
    expect(sheetTitles()).toEqual(['versionUpdate.title'])
  })
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
    expect(mocks.setItem).toHaveBeenCalledWith('orbit:version-update-snoozed-until', expect.any(String))
    const storedSnooze = mocks.setItem.mock.calls.find(([key]) => key === 'orbit:version-update-snoozed-until')?.[1] as string
    expect(JSON.parse(storedSnooze)).toEqual({ versionCode: '141', until: snoozedUntil })
    mocks.getItem.mockResolvedValue(storedSnooze)
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
    const error = new CodedError('ERR_APP_UPDATE_CHECK', 'Unexpected Play failure')
    mocks.readDownloaded.mockRejectedValue(error)
    await mount()
    expect(sheetTitles()).toEqual([])
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'android_update_install_status' },
    })
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'success', play_status: 2, available_version_code: 141,
      installed_version_code: 140, play_error_code: null,
    })
  })
  it.each([
    'Failed to bind to the service.',
    'Install Error(-3): The API is not available on this device.',
    'Install Error(-9): The Play Store app is either not installed or not the official version.',
  ])('does not report a native unavailable-service rejection or prompt for an update: %s', async (message) => {
    mocks.readDownloaded.mockRejectedValue(new CodedError('ERR_APP_UPDATE_SERVICE_UNAVAILABLE', message))
    await mount()
    expect(mocks.readDownloaded).toHaveBeenCalledOnce()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(sheetTitles()).toEqual([])
    expect(mocks.present).not.toHaveBeenCalled()
    expect(mocks.startUpdate).not.toHaveBeenCalled()
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
  })
  it.each([
    'm9.E: Failed to bind to the service.',
    'com.google.android.play.core.install.InstallException: Install Error(-3): The API is not available on this device.',
    'com.google.android.play.core.install.InstallException: Install Error(-9): The Play Store app is either not installed or not the official version.',
  ])('does not report an unavailable install-status service to Sentry: %s', async (message) => {
    mocks.readDownloaded.mockRejectedValue(new Error(message))
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'success', play_status: 2, available_version_code: 141,
      installed_version_code: 140, play_error_code: null,
    })
    expect(sheetTitles()).toEqual([])
  })
  it.each(['', 'unknown', '1.3.81', '0'])('never uses the version name when the build code is %s', async (build) => {
    mocks.installedBuild = build
    await mount()
    expect(sheetTitles()).toEqual([])
    expect(mocks.checkNeedsUpdate).not.toHaveBeenCalled()
  })

})
