import { captureException } from '@sentry/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DescriptionViewer } from '@/components/habits/description-viewer'
import { ReferralDrawer } from '@/components/referral/referral-drawer'

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn() }))
const referral = vi.hoisted(() => ({ url: 'https://app.useorbit.org/r/test-code' }))

vi.mock('expo-clipboard', () => clipboard)
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({ referralUrl: referral.url, stats: null, isLoading: false, isError: false }),
}))
vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: React.ReactNode }) => React.createElement('Text', null, children),
}))

interface TestNode {
  type: unknown
  props: { accessibilityLabel?: string; onPress?: () => void }
}
interface TestTree {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
  unmount: () => void
}
const TestRenderer: {
  create: (element: React.ReactNode) => TestTree
  act: (callback: () => void | Promise<void>) => void | Promise<void>
} = require('react-test-renderer')

const copyActions = [
  {
    name: 'habit description',
    label: 'habits.detail.copyDescription',
    text: '**A habit**\nWith details',
    element: <DescriptionViewer open onClose={vi.fn()} title="Habit" description={'**A habit**\nWith details'} />,
  },
  {
    name: 'literal null description',
    label: 'habits.detail.copyDescription',
    text: 'null',
    element: <DescriptionViewer open onClose={vi.fn()} title="Habit" description="null" />,
  },
  {
    name: 'referral link',
    label: 'referral.drawer.copyLink',
    text: referral.url,
    element: <ReferralDrawer open onClose={vi.fn()} />,
  },
]

let tree: TestTree
async function render(element: React.ReactNode) {
  await TestRenderer.act(() => { tree = TestRenderer.create(element) })
}
function copy(label: string) {
  const button = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === label)[0]
  return button!.props.onPress!()
}
function copiedIcons() {
  return tree.root.findAll((node) => node.type === 'Check')
}

beforeEach(() => {
  vi.useFakeTimers()
  clipboard.setStringAsync.mockReset().mockResolvedValue(true)
  vi.mocked(captureException).mockClear()
  vi.spyOn(AccessibilityInfo, 'announceForAccessibility')
})
afterEach(async () => {
  await TestRenderer.act(() => { tree.unmount() })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe.each(copyActions)('$name copy', ({ element, label, text }) => {
  it('confirms only after writing the exact text and clears confirmation', async () => {
    let finishWrite!: (value: boolean) => void
    const write = new Promise<boolean>((resolve) => { finishWrite = resolve })
    clipboard.setStringAsync.mockReturnValueOnce(write)
    await render(element)
    await TestRenderer.act(() => { copy(label) })
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(text)
    expect(copiedIcons()).toHaveLength(0)
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { finishWrite(true); await write })
    expect(copiedIcons()).toHaveLength(1)
    if (label === 'referral.drawer.copyLink') {
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('referral.drawer.linkCopied')
    }
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(copiedIcons()).toHaveLength(0)
  })

  it('does not confirm a rejected clipboard write', async () => {
    const failure = new Error('Clipboard unavailable')
    clipboard.setStringAsync.mockRejectedValueOnce(failure)
    await render(element)
    await TestRenderer.act(() => { copy(label) })
    expect(captureException).toHaveBeenCalledWith(failure)
    expect(copiedIcons()).toHaveLength(0)
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  })
})

it('does not copy a missing referral link', async () => {
  referral.url = ''
  await render(<ReferralDrawer open onClose={vi.fn()} />)
  await TestRenderer.act(() => { copy('referral.drawer.copyLink') })
  expect(clipboard.setStringAsync).not.toHaveBeenCalled()
  expect(copiedIcons()).toHaveLength(0)
})
