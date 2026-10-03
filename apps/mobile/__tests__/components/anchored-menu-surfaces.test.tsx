import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { TodayDateControl } from '@/components/today/today-date-control'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Menu, useAnchoredMenu } from '@/components/ui/menu'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

interface RenderedNode {
  props: { accessibilityLabel?: string; open?: boolean; items: { id: string }[]; onPress: () => void; onClose: () => void; onDidDismiss: () => void; onRequestClose: () => void }
  findAllByType: (type: string | typeof Menu | typeof TrueSheet) => RenderedNode[]
}
interface RenderedTree {
  root: RenderedNode
  update: (element: React.ReactNode) => void
  unmount: () => void
  toJSON: () => unknown
}
vi.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
const nativeDismiss = vi.hoisted(() => vi.fn(() => Promise.resolve()))
beforeEach(() => nativeDismiss.mockClear())
vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = nativeDismiss
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))
afterEach(__resetTestHostConfig)

function TodayControls() {
  return <TodayDateControl dayName="Monday" numericDate="01/01" isTodaySelected nextDisabled={false}
    previousLabel="Previous" todayLabel="Today" goToTodayLabel="Go to today" nextLabel="Next"
    moreLabel="List options" selectLabel="Select" collapseLabel="Collapse" allCollapsed={false}
    refreshLabel="Refresh" completedLabel="Completed" showCompleted={false} isFetching={false}
    searchLabel="Search" onSearch={vi.fn()} onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()}
    onRefresh={vi.fn()} onToggleCompleted={vi.fn()} onGoToPreviousDay={vi.fn()}
    onGoToToday={vi.fn()} onGoToNextDay={vi.fn()} />
}

function trigger(tree: RenderedTree, label: string): RenderedNode {
  return tree.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label)!
}

function openMenus(tree: RenderedTree): RenderedNode[] {
  return tree.root.findAllByType(Menu).filter((node) => node.props.open)
}

const cases = (['sheet', 'anchored'] as const).flatMap((presentation) =>
  (['open', 'exiting', 'reopened'] as const).map((phase) => ({ presentation, phase })))

describe('redesign menu ownership on Android', () => {
  it.each(cases)('replaces the $phase $presentation controls menu with a row and back', async ({ presentation, phase }) => {
    __setWindowDimensions({ width: presentation === 'sheet' ? 412 : 1280, height: 915, scale: 1, fontScale: 1 })
    let tree!: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<>
      <TodayControls />
      <HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />
    </>) as unknown as RenderedTree })
    const pendingDismissals: (() => void)[] = []
    const prepare = async (label: string) => {
      await TestRenderer.act(() => trigger(tree, label).props.onPress())
      expect(openMenus(tree)).toHaveLength(1)
      if (phase === 'open') return
      if (presentation === 'sheet') {
        const complete = tree.root.findAllByType(TrueSheet)[0]!.props.onDidDismiss
        pendingDismissals.push(complete)
        await TestRenderer.act(() => trigger(tree, 'common.close').props.onPress())
        expect(nativeDismiss).toHaveBeenCalled()
        expect(openMenus(tree)).toHaveLength(1)
        if (phase === 'reopened') await TestRenderer.act(() => complete())
      } else {
        await TestRenderer.act(() => tree.root.findAllByType('Modal')[0]!.props.onRequestClose())
        expect(openMenus(tree)).toHaveLength(0)
      }
      if (phase === 'reopened') await TestRenderer.act(() => trigger(tree, label).props.onPress())
    }
    try {
      await prepare('List options')
      await prepare('habits.actions.more')
      if (phase !== 'exiting') {
        expect(openMenus(tree)).toHaveLength(1)
        expect(openMenus(tree)[0]!.props.items.map((item: { id: string }) => item.id)).toEqual(['edit'])
      }
      await TestRenderer.act(() => trigger(tree, 'List options').props.onPress())
      expect(openMenus(tree)).toHaveLength(1)
      expect(openMenus(tree)[0]!.props.items.map((item: { id: string }) => item.id)).toContain('select')
      expect(JSON.stringify(tree.toJSON())).not.toContain('common.edit')
      expect(tree.root.findAllByType('Modal')).toHaveLength(presentation === 'anchored' ? 1 : 0)
      for (const complete of pendingDismissals) await TestRenderer.act(() => complete())
      expect(openMenus(tree)).toHaveLength(1)
      expect(openMenus(tree)[0]!.props.items.map((item: { id: string }) => item.id)).toContain('select')
    } finally {
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it.each(cases)('replaces the $phase $presentation row menu and releases an unmounted owner', async ({ presentation, phase }) => {
    __setWindowDimensions({ width: presentation === 'sheet' ? 412 : 1280, height: 915, scale: 1, fontScale: 1 })
    function Rows({ showFirst }: { showFirst: boolean }) {
      return <>
        {showFirst ? <HabitRow key="a" habit={createMockHabit({ id: 'a', title: 'Read' })} actions={{ onEdit: vi.fn() }} /> : null}
        <HabitRow key="b" habit={createMockHabit({ id: 'b', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
        <HabitRow key="c" habit={createMockHabit({ id: 'c', title: 'Walk' })} actions={{ onDuplicate: vi.fn() }} />
      </>
    }
    let tree!: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<Rows showFirst />) as unknown as RenderedTree })
    let pendingDismissal: (() => void) | undefined
    const triggers = () => tree.root.findAllByType('Pressable').filter((node) => node.props.accessibilityLabel === 'habits.actions.more')
    try {
      await TestRenderer.act(() => triggers()[0]!.props.onPress())
      if (phase !== 'open') {
        if (presentation === 'sheet') {
          pendingDismissal = tree.root.findAllByType(TrueSheet)[0]!.props.onDidDismiss
          await TestRenderer.act(() => trigger(tree, 'common.close').props.onPress())
          expect(nativeDismiss).toHaveBeenCalled()
          expect(openMenus(tree)).toHaveLength(1)
          if (phase === 'reopened') await TestRenderer.act(() => pendingDismissal?.())
        } else {
          await TestRenderer.act(() => tree.root.findAllByType('Modal')[0]!.props.onRequestClose())
          expect(openMenus(tree)).toHaveLength(0)
        }
        if (phase === 'reopened') await TestRenderer.act(() => triggers()[0]!.props.onPress())
      }
      await TestRenderer.act(() => triggers()[1]!.props.onPress())
      expect(openMenus(tree)).toHaveLength(1)
      expect(JSON.stringify(tree.toJSON())).toContain('habits.actions.delete')
      expect(JSON.stringify(tree.toJSON())).not.toContain('common.edit')
      await TestRenderer.act(() => tree.update(<Rows showFirst={false} />))
      await TestRenderer.act(() => triggers()[1]!.props.onPress())
      expect(openMenus(tree)).toHaveLength(1)
      expect(JSON.stringify(tree.toJSON())).toContain('habits.actions.duplicate')
      expect(JSON.stringify(tree.toJSON())).not.toContain('habits.actions.delete')
      await TestRenderer.act(() => pendingDismissal?.())
      expect(openMenus(tree)).toHaveLength(1)
    } finally {
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it('ignores native dismissal from a replaced sheet after the same row reopens', async () => {
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
    let tree!: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<>
      <TodayControls />
      <HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />
    </>) as unknown as RenderedTree })
    try {
      await TestRenderer.act(() => trigger(tree, 'habits.actions.more').props.onPress())
      const oldDismissal = tree.root.findAllByType(TrueSheet)[0]!.props.onDidDismiss
      await TestRenderer.act(() => trigger(tree, 'common.close').props.onPress())
      expect(nativeDismiss).toHaveBeenCalledOnce()
      expect(openMenus(tree)).toHaveLength(1)
      await TestRenderer.act(() => trigger(tree, 'List options').props.onPress())
      await TestRenderer.act(() => trigger(tree, 'habits.actions.more').props.onPress())
      await TestRenderer.act(() => oldDismissal())
      expect(openMenus(tree)).toHaveLength(1)
      expect(JSON.stringify(tree.toJSON())).toContain('common.edit')
      await TestRenderer.act(() => trigger(tree, 'List options').props.onPress())
      expect(openMenus(tree)).toHaveLength(1)
      expect(JSON.stringify(tree.toJSON())).not.toContain('common.edit')
    } finally {
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it('does not let a stale unmounted close release a replacement owner', async () => {
    const controllers: ReturnType<typeof useAnchoredMenu>[] = []
    function Owner({ index }: { index: number }) {
      const menu = useAnchoredMenu()
      React.useEffect(() => { controllers[index] = menu })
      return null
    }
    let tree!: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<Owner index={0} />) as unknown as RenderedTree })
    await TestRenderer.act(() => controllers[0]!.open())
    const staleClose = controllers[0]!.close
    await TestRenderer.act(() => tree.update(<><Owner key="b" index={1} /><Owner key="c" index={2} /></>))
    await TestRenderer.act(() => controllers[1]!.open())
    await TestRenderer.act(() => staleClose())
    await TestRenderer.act(() => controllers[2]!.open())
    expect(controllers[1]!.visible).toBe(false)
    expect(controllers[2]!.visible).toBe(true)
    await TestRenderer.act(() => tree.unmount())
  })
})
