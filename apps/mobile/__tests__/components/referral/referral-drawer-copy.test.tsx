import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureError } from '@/lib/sentry'
import { ReferralDrawer } from '@/components/referral/referral-drawer'

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn() }))
const referral = vi.hoisted(() => ({ url: 'https://app.useorbit.org/r/test-code' }))

vi.mock('expo-clipboard', () => clipboard)
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({ referralUrl: referral.url, stats: null, isLoading: false, isError: false }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

interface TestNode {
  type: unknown
  props: { accessibilityLabel?: string; onPress?: () => void; testID?: string; style?: unknown }
}
interface TestTree {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
  unmount: () => void
}
const TestRenderer: {
  create: (element: React.ReactNode) => TestTree
  act: (callback: () => void | Promise<void>) => void | Promise<void>
} = require('react-test-renderer')

const COPY_LABEL = 'referral.drawer.copyLink'
let tree: TestTree

async function render() {
  await TestRenderer.act(() => { tree = TestRenderer.create(<ReferralDrawer open onClose={vi.fn()} />) })
}

function copy() {
  const button = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === COPY_LABEL)[0]
  return button!.props.onPress!()
}

function copiedIcons() {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'check-icon' && (StyleSheet.flatten(node.props.style as object) as { opacity?: number } | undefined)?.opacity === 1)
}

beforeEach(() => {
  vi.useFakeTimers()
  referral.url = 'https://app.useorbit.org/r/test-code'
  clipboard.setStringAsync.mockReset().mockResolvedValue(true)
  vi.mocked(captureError).mockClear()
  vi.spyOn(AccessibilityInfo, 'announceForAccessibility')
})
afterEach(async () => {
  await TestRenderer.act(() => { tree.unmount() })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('referral link copy', () => {
  it('confirms only after it writes the exact link and drops the confirmation after two seconds', async () => {
    let finishWrite!: (value: boolean) => void
    const write = new Promise<boolean>((resolve) => { finishWrite = resolve })
    clipboard.setStringAsync.mockReturnValueOnce(write)
    await render()
    await TestRenderer.act(() => { copy() })
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(referral.url)
    expect(copiedIcons()).toHaveLength(0)
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { finishWrite(true); await write })
    expect(copiedIcons()).toHaveLength(1)
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('referral.drawer.linkCopied')
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(copiedIcons()).toHaveLength(0)
  })

  it('does not confirm a rejected clipboard write', async () => {
    const failure = new Error('Clipboard unavailable')
    clipboard.setStringAsync.mockRejectedValueOnce(failure)
    await render()
    await TestRenderer.act(() => { copy() })
    expect(captureError).toHaveBeenCalledWith(failure)
    expect(copiedIcons()).toHaveLength(0)
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  })

  it('leaves no referral confirmation timer after the drawer unmounts', async () => {
    await render()
    await TestRenderer.act(() => { copy() })
    expect(copiedIcons()).toHaveLength(1)
    await TestRenderer.act(() => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not copy a missing referral link', async () => {
    referral.url = ''
    await render()
    await TestRenderer.act(() => { copy() })
    expect(clipboard.setStringAsync).not.toHaveBeenCalled()
    expect(copiedIcons()).toHaveLength(0)
  })
})
