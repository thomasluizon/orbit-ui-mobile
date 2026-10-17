import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  wrapped: vi.fn(), share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn(), refetch: vi.fn(),
  isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false,
  canShareFiles: true, savedFileName: null as string | null,
}))
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: (period: string, options: unknown) => {
  mocks.wrapped(period, options)
  return { recap: createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: mocks.isEmpty ? 0 : 5, totalCompletions: mocks.isEmpty ? 0 : 40, completionRate: mocks.isEmpty ? 0 : 73.5 }) }), ...mocks }
} }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ shareRef: { current: null }, ...mocks }) }))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  findByType: (type: unknown) => TestNode
}
type Tree = { root: TestNode; toJSON: () => unknown; update: (element: React.ReactElement) => void }
function renderEntry() {
  let tree!: Tree
  TestRenderer.act(() => { tree = TestRenderer.create(<ShareCardEntryButton variant="button" />) })
  return tree
}
function openSheet(tree: Tree) {
  const entry = tree.root.findByType(PillButton)
  TestRenderer.act(() => { (entry.props.onClick as () => void)() })
}
function action(tree: Tree, label: string) {
  return tree.root.findAll((node) => node.type === PillButton && node.props.children === label)[0]!
}

describe('Share progress sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks, { isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false, canShareFiles: true, savedFileName: null })
  })

  it('opens on demand, renders the restored figures, and switches periods', () => {
    const tree = renderEntry()
    expect(mocks.wrapped).not.toHaveBeenCalled()
    openSheet(tree)
    const text = JSON.stringify(tree.toJSON())
    expect(text).toContain('shareCard.stats.activeDays')
    expect(text).toContain('74%')
    expect(mocks.wrapped).toHaveBeenLastCalledWith('week', { enabled: true })
    TestRenderer.act(() => { (tree.root.findByType(SegmentedControl).props.onChange as (period: string) => void)('month') })
    expect(mocks.wrapped).toHaveBeenLastCalledWith('month', { enabled: true })
    expect(mocks.resetFeedback).toHaveBeenCalledOnce()
  })

  it('passes the recap link to native sharing and downloads the image', () => {
    const tree = renderEntry()
    openSheet(tree)
    TestRenderer.act(() => { (action(tree, 'shareCard.share').props.onClick as () => void)() })
    expect(mocks.share).toHaveBeenCalledWith({ shareTitle: 'shareCard.shareTitle', shareText: 'shareCard.shareText', url: createMockRecap().shareDeepLink })
    TestRenderer.act(() => { (action(tree, 'shareCard.download').props.onClick as () => void)() })
    expect(mocks.download).toHaveBeenCalledOnce()
  })

  it.each(['isLoading', 'isError', 'isEmpty'] as const)('withholds export during %s', (state) => {
    mocks[state] = true
    const tree = renderEntry()
    openSheet(tree)
    expect(tree.root.findAll((node) => node.props.testID === 'share-card')).toHaveLength(0)
    expect(action(tree, 'shareCard.download').props.disabled).toBe(true)
    expect(action(tree, 'shareCard.share').props.disabled).toBe(true)
    if (state === 'isError') {
      TestRenderer.act(() => { (action(tree, 'common.retry').props.onClick as () => void)() })
      expect(mocks.refetch).toHaveBeenCalledOnce()
    }
    if (state === 'isEmpty') expect(JSON.stringify(tree.toJSON())).toContain('shareCard.empty')
    if (state === 'isLoading') expect(tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0)
  })

  it('disables export and period selection while capturing', () => {
    mocks.isSharing = true
    const tree = renderEntry()
    openSheet(tree)
    expect(action(tree, 'shareCard.download').props.disabled).toBe(true)
    expect(action(tree, 'shareCard.share').props.disabled).toBe(true)
    expect(tree.root.findByType(SegmentedControl).props.disabled).toBe(true)
  })

  it('keeps download available without native file sharing', () => {
    mocks.canShareFiles = false
    const tree = renderEntry()
    openSheet(tree)
    expect(tree.root.findAll((node) => node.type === PillButton && node.props.children === 'shareCard.share')).toHaveLength(0)
    expect(action(tree, 'shareCard.download').props.disabled).toBe(false)
  })

  it('announces export errors and save confirmation', () => {
    const tree = renderEntry()
    openSheet(tree)
    const alerts = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.props.children).toBe('')
    mocks.hasError = true
    TestRenderer.act(() => { tree.update(<ShareCardEntryButton variant="button" />) })
    expect(JSON.stringify(tree.toJSON())).toContain('shareCard.shareError')
    mocks.hasError = false
    mocks.savedFileName = 'orbit-recap.png'
    TestRenderer.act(() => { tree.update(<ShareCardEntryButton variant="button" />) })
    expect(JSON.stringify(tree.toJSON())).toContain('shareCard.saved')
  })
})
