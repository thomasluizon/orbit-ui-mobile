import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  platform: 'android',
  install: vi.fn(),
  downloaded: true,
  forceUpdate: false,
  flexibleActive: false,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/hooks/use-version-check', () => ({
  startAndroidUpdate: vi.fn(),
  useAndroidFlexibleUpdate: (active: boolean) => { mocks.flexibleActive = active; return { downloaded: mocks.downloaded, install: mocks.install } },
  useVersionCheck: () => ({
    updateAvailable: true,
    forceUpdate: mocks.forceUpdate,
    latestVersion: '1.4.0',
    currentVersion: '1.3.27',
    iosStoreUrl: 'https://apps.apple.com/app/id1',
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  radius: new Proxy({}, { get: () => 12 }),
}))

vi.mock('react-native', async () => {
  const reactNative = await import('../../test-mocks/react-native')
  return {
    ...reactNative,
    Platform: { get OS() { return mocks.platform } },
    default: { ...reactNative.default, Platform: { get OS() { return mocks.platform } } },
  }
})

function render() {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(VersionUpdateDrawer))
  })
  return tree
}

function sheetCount(tree: any) {
  return tree.root.findAllByType('Sheet').length
}

function pressPill(tree: any, label: string) {
  const pill = tree.root
    .findAll(
      (node: any) =>
        typeof node.props?.onClick === 'function' &&
        node.findAll(
          (child: any) => child.type === 'Text' && child.props.children === label,
        ).length > 0,
    )
    .at(-1)
  if (!pill) throw new Error(`Action not found: ${label}`)
  TestRenderer.act(() => {
    pill.props.onClick()
  })
}

/**
 * Later used to flip the state controlling `open`, which unmounted a presented
 * TrueSheet. Both actions have to wait for the native dismissal.
 */
describe('VersionUpdateDrawer close path', () => {
  beforeEach(() => {
    mocks.platform = 'android'
    mocks.downloaded = true
    mocks.forceUpdate = false
    mocks.flexibleActive = false
    mocks.install.mockReset()
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('keeps the sheet mounted on Later until the dismissal completes', () => {
    const tree = render()
    expect(sheetCount(tree)).toBe(1)

    pressPill(tree, 'versionUpdate.laterCta')

    expect(sheetCount(tree)).toBe(1)
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(sheetCount(tree)).toBe(0)
  })

  it('installs the Android update only once the sheet is gone', () => {
    const tree = render()

    pressPill(tree, 'versionUpdate.restartCta')

    expect(mocks.install).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mocks.install).toHaveBeenCalledTimes(1)
  })
  it('shows a dismissible soft update before starting Play', async () => {
    mocks.downloaded = false
    let tree: ReturnType<typeof render>
    await TestRenderer.act(() => { tree = render() })
    expect(sheetCount(tree)).toBe(1)
    expect(mocks.flexibleActive).toBe(false)
    pressPill(tree, 'versionUpdate.updateCta')
    expect(mocks.flexibleActive).toBe(false)
    await TestRenderer.act(() => { sheetTestControls.completeDismissal() })
    expect(mocks.flexibleActive).toBe(true)
    expect(sheetCount(tree)).toBe(0)
  })

  it('lets Later dismiss the soft update without starting Play', async () => {
    mocks.downloaded = false
    let tree: ReturnType<typeof render>
    await TestRenderer.act(() => { tree = render() })
    pressPill(tree, 'versionUpdate.laterCta')
    await TestRenderer.act(() => { sheetTestControls.completeDismissal() })
    expect(sheetCount(tree)).toBe(0)
    expect(mocks.flexibleActive).toBe(false)
  })

  it('leaves forced updates to Play without an Orbit drawer', async () => {
    mocks.downloaded = false
    mocks.forceUpdate = true
    let tree: ReturnType<typeof render>
    await TestRenderer.act(() => { tree = render() })
    expect(sheetCount(tree)).toBe(0)
    expect(mocks.flexibleActive).toBe(false)
    const { startAndroidUpdate } = await import('@/hooks/use-version-check')
    expect(startAndroidUpdate).toHaveBeenCalledWith({ immediate: true })
  })

})
