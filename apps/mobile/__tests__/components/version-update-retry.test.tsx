import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

interface TestNode {
  type: unknown
  props: { children?: unknown; onClick?: () => void }
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

interface TestTree { root: TestNode; unmount: () => void }

const TestRenderer: {
  create: (element: React.ReactNode) => TestTree
  act: (callback: () => void | Promise<void>) => Promise<void>
} = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  startUpdate: vi.fn(),
  installUpdate: vi.fn(),
  intentListener: null as ((result: string) => void) | null,
  statusListener: null as ((event: { status: number; bytesDownloaded: number; totalBytesToDownload: number }) => void) | null,
  removeIntentSelectionListener: vi.fn(),
  removeStatusUpdateListener: vi.fn(),
}))

vi.mock('sp-react-native-in-app-updates', () => ({
  default: class {
    startUpdate = mocks.startUpdate
    installUpdate = mocks.installUpdate
    addIntentSelectionListener(listener: (result: string) => void) { mocks.intentListener = listener }
    removeIntentSelectionListener = mocks.removeIntentSelectionListener
    addStatusUpdateListener(listener: NonNullable<typeof mocks.statusListener>) { mocks.statusListener = listener }
    removeStatusUpdateListener = mocks.removeStatusUpdateListener
  },
  IAUUpdateKind: { FLEXIBLE: 0, IMMEDIATE: 1 },
  IAUInstallStatus: { INSTALLED: 4, FAILED: 5, CANCELED: 6, DOWNLOADED: 11 },
}))

vi.mock('@/hooks/use-version-check', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-version-check')>(),
  useVersionCheck: () => ({ updateAvailable: true, forceUpdate: false, iosStoreUrl: null }),
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(() => Promise.resolve(null)), setItem: vi.fn(() => Promise.resolve()) },
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

let tree: TestTree

function hasSheet() {
  return tree.root.findAll((node) => node.type === 'Sheet').length > 0
}

async function pressAction(label: string) {
  const button = tree.root.findAll((node) => typeof node.props.onClick === 'function' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0).at(-1)
  if (!button) throw new Error(`Missing action: ${label}`)
  await TestRenderer.act(() => { button.props.onClick?.() })
}

async function dismiss() {
  await TestRenderer.act(() => { sheetTestControls.completeDismissal() })
}

describe('Android flexible update recovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.startUpdate.mockReset().mockResolvedValue(undefined)
    mocks.intentListener = null
    mocks.statusListener = null
    sheetTestControls.defer(true)
    await TestRenderer.act(() => { tree = TestRenderer.create(<VersionUpdateDrawer />) })
  })

  afterEach(async () => {
    await TestRenderer.act(() => { tree.unmount() })
    sheetTestControls.defer(false)
  })

  it.each(['rejection', 'cancellation'] as const)('restores the action after %s and succeeds on a second attempt in the same session', async (failure) => {
    if (failure === 'rejection') mocks.startUpdate.mockRejectedValueOnce(new Error('Play launch failed'))
    expect(hasSheet()).toBe(true)
    await pressAction('versionUpdate.updateCta')
    expect(mocks.startUpdate).not.toHaveBeenCalled()
    expect(hasSheet()).toBe(true)
    await dismiss()
    expect(mocks.startUpdate).toHaveBeenCalledTimes(1)

    if (failure === 'cancellation') {
      expect(hasSheet()).toBe(false)
      await TestRenderer.act(() => { mocks.intentListener?.('6') })
    }
    expect(hasSheet()).toBe(true)
    await pressAction('versionUpdate.updateCta')
    expect(mocks.startUpdate).toHaveBeenCalledTimes(1)
    await dismiss()
    expect(mocks.startUpdate).toHaveBeenCalledTimes(2)
    expect(hasSheet()).toBe(false)

    await TestRenderer.act(() => { mocks.intentListener?.('4') })
    expect(hasSheet()).toBe(false)
    await TestRenderer.act(() => { mocks.statusListener?.({ status: 11, bytesDownloaded: 100, totalBytesToDownload: 100 }) })
    expect(hasSheet()).toBe(true)
    await pressAction('versionUpdate.restartCta')
    expect(mocks.installUpdate).not.toHaveBeenCalled()
    await dismiss()
    expect(mocks.installUpdate).toHaveBeenCalledOnce()
  })

  it('unsubscribes both native event channels on unmount', async () => {
    const intentListener = mocks.intentListener
    const statusListener = mocks.statusListener
    await TestRenderer.act(() => { tree.unmount() })
    expect(intentListener).toEqual(expect.any(Function))
    expect(mocks.removeIntentSelectionListener).toHaveBeenCalledWith(intentListener)
    expect(mocks.removeStatusUpdateListener).toHaveBeenCalledWith(statusListener)
  })
})
