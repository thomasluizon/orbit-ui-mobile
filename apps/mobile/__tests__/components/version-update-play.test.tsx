import React from 'react'
import { CodedError } from 'expo-modules-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import * as Sentry from '@sentry/react-native'
import { captureAndroidUpdateCheck, captureAndroidUpdateSheetShown } from '@/lib/posthog'
import { Sheet } from '@/components/ui/sheet'
import { __resetTestHostConfig, __setMeasureInWindowImpl, __setWindowDimensions } from '../../test-mocks/react-native'

vi.unmock('@/components/ui/sheet')

interface TestNode {
  type: unknown
  props: {
    children?: unknown; title?: string; onClick?: () => void; testID?: string
    onLayout?: (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
  }
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
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  sheetPosition: 0,
  nativeListeners: new Map<string, Set<(event: unknown) => void>>(),
}))

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{
    children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode
    onDidPresent?: (event: { nativeEvent: { index: number; position: number; detent: number } }) => void
    onDidDismiss?: () => void
  }> {
    async present() {
      await mocks.present()
      this.props.onDidPresent?.({ nativeEvent: { index: 0, position: mocks.sheetPosition, detent: 1 } })
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
  TurboModuleRegistry: {
    getEnforcing: (name: string) => {
      if (name !== 'SpInAppUpdates') throw new Error(`Unexpected native module: ${name}`)
      return {
        checkNeedsUpdate: mocks.checkNeedsUpdate,
        startUpdate: mocks.startUpdate,
        installUpdate: mocks.installUpdate,
        setStatusUpdateSubscription: vi.fn(),
        addListener: vi.fn(),
        removeListeners: vi.fn(),
      }
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
vi.mock('react-native-safe-area-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native-safe-area-context')>(),
  useSafeAreaInsets: () => mocks.insets,
}))
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
    tree = TestRenderer.create(<QueryClientProvider client={queryClient}><VersionUpdateDrawer suppressed={false} /></QueryClientProvider>)
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
function footerHost(testID: 'sheet-footer' | 'sheet-footer-space') {
  const host = tree?.root.findAll((node) => node.type === 'View' && node.props.testID === testID).at(0)
  if (!host?.props.onLayout) throw new Error(`Missing ${testID}`)
  return host.props.onLayout
}
/**
 * TrueSheet reports `position` as the sheet top in the window frame, while `measureInWindow` stops at the
 * TrueSheetView root node and returns the footer relative to the sheet container. The measured footer child
 * ends above the native bottom inset that TrueSheetFooterView pads below it.
 */
function placeFooter(sheetTop: number, footerLocalBottom: number) {
  mocks.sheetPosition = sheetTop
  __setMeasureInWindowImpl((callback, props) => {
    if (props.testID === 'sheet-footer') callback(0, footerLocalBottom - FOOTER_HEIGHT, 412, FOOTER_HEIGHT)
  })
}
async function layOutFooter(height: number, footerSpaceHeight = height) {
  const layout = (layoutHeight: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: layoutHeight } } })
  await TestRenderer.act(() => footerHost('sheet-footer')(layout(height)))
  await TestRenderer.act(() => footerHost('sheet-footer-space')(layout(footerSpaceHeight)))
}
const FOOTER_HEIGHT = 92
const WINDOW_HEIGHT = 892
const SHEET_HEIGHT = 400
const NATIVE_BOTTOM_INSET = 24
const SHEET_TOP = WINDOW_HEIGHT - SHEET_HEIGHT
const FOOTER_LOCAL_BOTTOM = SHEET_HEIGHT - NATIVE_BOTTOM_INSET
const DRAWN_FOOTER = {
  footer_height: FOOTER_HEIGHT, footer_space_height: FOOTER_HEIGHT, sheet_position: SHEET_TOP,
  footer_local_bottom: FOOTER_LOCAL_BOTTOM, footer_bottom: SHEET_TOP + FOOTER_LOCAL_BOTTOM, window_width: 412,
  window_height: WINDOW_HEIGHT, font_scale: 1, bottom_inset: NATIVE_BOTTOM_INSET, footer_below_window: false,
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
  mocks.insets = { top: 0, bottom: NATIVE_BOTTOM_INSET, left: 0, right: 0 }
  __resetTestHostConfig()
  placeFooter(SHEET_TOP, FOOTER_LOCAL_BOTTOM)
})
afterEach(async () => {
  await unmount()
  __resetTestHostConfig()
  vi.useRealTimers()
})

describe('Play update sheet footer report', () => {
  it('records the drawn footer geometry without a warning', async () => {
    __setWindowDimensions({ width: 594, height: 939, scale: 2.625, fontScale: 1.3 })
    placeFooter(939 - 420, 420 - NATIVE_BOTTOM_INSET)
    await mount()
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await layOutFooter(FOOTER_HEIGHT)
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140,
      footer_height: FOOTER_HEIGHT, footer_space_height: FOOTER_HEIGHT, sheet_position: 519, footer_local_bottom: 396,
      footer_bottom: 915, window_width: 594, window_height: 939, font_scale: 1.3, bottom_inset: NATIVE_BOTTOM_INSET,
      footer_below_window: false,
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledOnce()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
  it('waits until the reserved footer space matches the footer', async () => {
    await mount()
    await layOutFooter(FOOTER_HEIGHT, 0)
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await TestRenderer.act(() => footerHost('sheet-footer-space')({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: FOOTER_HEIGHT } } }))
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(DRAWN_FOOTER))
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
  it('warns once after the bounded wait when the footer measures 0', async () => {
    await mount()
    await layOutFooter(0)
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(900) })
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const footer = { ...DRAWN_FOOTER, footer_height: 0, footer_space_height: 0 }
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(footer))
    expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith('android_update_sheet_footer_hidden', {
      level: 'warning', tags: { operation: 'android_update_sheet_footer', reason: 'zero_height' }, extra: footer,
    })
    await layOutFooter(FOOTER_HEIGHT)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledOnce()
    expect(Sentry.captureMessage).toHaveBeenCalledOnce()
  })
  it('warns after the bounded wait when the footer never lays out', async () => {
    await mount()
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    const footer = { ...DRAWN_FOOTER, footer_height: null, footer_space_height: null }
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(footer))
    expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith('android_update_sheet_footer_hidden', {
      level: 'warning', tags: { operation: 'android_update_sheet_footer', reason: 'zero_height' }, extra: footer,
    })
  })
  it('warns once when the drawn footer ends below the window although its sheet-local bottom is inside it', async () => {
    const loweredSheetTop = SHEET_TOP + FOOTER_HEIGHT + NATIVE_BOTTOM_INSET
    placeFooter(loweredSheetTop, FOOTER_LOCAL_BOTTOM)
    await mount()
    await layOutFooter(FOOTER_HEIGHT)
    const footer = {
      ...DRAWN_FOOTER, sheet_position: loweredSheetTop, footer_bottom: WINDOW_HEIGHT + FOOTER_HEIGHT, footer_below_window: true,
    }
    expect(footer.footer_local_bottom).toBeLessThan(WINDOW_HEIGHT)
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(footer))
    expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith('android_update_sheet_footer_hidden', {
      level: 'warning', tags: { operation: 'android_update_sheet_footer', reason: 'below_window' }, extra: footer,
    })
    await layOutFooter(FOOTER_HEIGHT)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(Sentry.captureMessage).toHaveBeenCalledOnce()
  })
  it('does not warn for a sub-pixel overshoot of the window', async () => {
    placeFooter(WINDOW_HEIGHT + 0.5 - FOOTER_LOCAL_BOTTOM, FOOTER_LOCAL_BOTTOM)
    await mount()
    await layOutFooter(FOOTER_HEIGHT)
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ footer_bottom: WINDOW_HEIGHT + 0.5, footer_below_window: false }))
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
  it('records the sheet when it closes before the footer report settles', async () => {
    await mount()
    await press('versionUpdate.laterCta')
    expect(sheetTitles()).toEqual([])
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      sheet: 'available', footer_height: null, sheet_position: SHEET_TOP, footer_local_bottom: null, footer_bottom: null,
      footer_below_window: null,
    }))
  })
})

describe('Play update sheet selection', () => {
  it('records the sheet only after native presentation completes', async () => {
    let completePresentation!: () => void
    mocks.present.mockImplementation(() => new Promise((resolve) => { completePresentation = resolve }))
    await mount()
    await layOutFooter(FOOTER_HEIGHT)
    expect(mocks.present).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateSheetShown).not.toHaveBeenCalled()
    await TestRenderer.act(() => completePresentation())
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140, ...DRAWN_FOOTER,
    })
  })
  it('does not record another presentation when the offered version changes on the mounted sheet', async () => {
    await mount()
    await layOutFooter(FOOTER_HEIGHT)
    mocks.offeredBuild = 142
    await TestRenderer.act(() => {
      for (const listener of mocks.resumeListeners) listener('active')
    })
    await flushQueries()
    expect(captureAndroidUpdateCheck).toHaveBeenLastCalledWith(expect.objectContaining({ available_version_code: 142 }))
    expect(mocks.present).toHaveBeenCalledOnce()
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140, ...DRAWN_FOOTER,
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
    await layOutFooter(FOOTER_HEIGHT)
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'success', play_status: 2, available_version_code: 141,
      installed_version_code: 140, play_error_code: null,
    })
    expect(captureAndroidUpdateSheetShown).toHaveBeenCalledExactlyOnceWith({
      sheet: 'available', available_version_code: 141, installed_version_code: 140, ...DRAWN_FOOTER,
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
    [-5, 'The install is unavailable to this user or device.'],
    [-6, 'The download/install is not allowed, due to the current device state (e.g. low battery, low disk space, ...).'],
    [-8, 'The install is already in progress and there is no UI flow to resume.'],
    [-9, 'The Play Store app is either not installed or not the official version.'],
    [-10, 'The app is not owned by any user on this device. An app is "owned" if it has been acquired from Play.'],
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
  it.each([-2, -4, -7, -100, -90, null])('reports unexpected Play failure code %s once without retrying', async (code) => {
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
  it.each([-3, -5, -6, -8, -9, -10])('records update-check unavailability code %s when install status succeeds', async (code) => {
    mocks.checkNeedsUpdate.mockRejectedValue(new Error(`Install Error(${code}): unavailable`))
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    expect(sheetTitles()).toEqual([])
  })
  it.each([-3, -5, -6, -8, -9, -10])('records native install-status unavailability code %s when the update check succeeds', async (code) => {
    mocks.readDownloaded.mockRejectedValue(new CodedError('ERR_APP_UPDATE_SERVICE_UNAVAILABLE', `Install Error(${code}): unavailable`))
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    expect(sheetTitles()).toEqual([])
    expect(mocks.present).not.toHaveBeenCalled()
  })
  it.each([-3, -5, -6, -8, -9, -10])('classifies native install-status code %s without a bridge error code', async (code) => {
    mocks.readDownloaded.mockRejectedValue(new Error(`Install Error(${code}): unavailable`))
    await mount()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    expect(sheetTitles()).toEqual([])
  })
  it.each([-2, -4, -7, -100, -90, null])('reports native install-status failure code %s with its operation tag', async (code) => {
    const message = code === null ? 'Unexpected Play failure' : `Install Error(${code}): unexpected failure`
    const error = new CodedError('ERR_APP_UPDATE_CHECK', message)
    mocks.readDownloaded.mockRejectedValue(error)
    await mount()
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'android_update_install_status' },
    })
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'error', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: code,
    })
    expect(sheetTitles()).toEqual([])
  })
  it.each(['check', 'install'] as const)('preserves a real %s failure alongside expected device unavailability', async (source) => {
    const unavailable = new CodedError('ERR_APP_UPDATE_SERVICE_UNAVAILABLE', 'Install Error(-6): device unavailable')
    const failure = new Error('Install Error(-4): malformed request')
    mocks.checkNeedsUpdate.mockRejectedValue(source === 'check' ? failure : unavailable)
    mocks.readDownloaded.mockRejectedValue(source === 'install' ? failure : unavailable)
    await mount()
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
      source === 'install' ? failure : expect.objectContaining({ message: expect.stringContaining(failure.message) }),
      source === 'install'
        ? { tags: { operation: 'android_update_install_status' } }
        : { tags: { operation: 'android_update_check' }, extra: { installed_version_code: 140, play_error_code: -4 } },
    )
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'error', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: -4,
    })
    expect(sheetTitles()).toEqual([])
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
      outcome: 'error', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: null,
    })
  })
  it('reports a synchronous install-status bridge failure', async () => {
    const error = new Error('Native module unavailable')
    mocks.readDownloaded.mockImplementation(() => { throw error })
    await mount()
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'android_update_install_status' },
    })
    expect(captureAndroidUpdateCheck).toHaveBeenCalledExactlyOnceWith({
      outcome: 'error', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: null,
    })
    expect(sheetTitles()).toEqual([])
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
      outcome: 'service_unavailable', play_status: null, available_version_code: null,
      installed_version_code: 140, play_error_code: message.includes('Install Error(-3)') ? -3 : message.includes('Install Error(-9)') ? -9 : null,
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
