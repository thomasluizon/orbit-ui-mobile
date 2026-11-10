import React from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'
import { useUIStore } from '@/stores/ui-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }))

const HEIGHT = 915
let tree: GeometryTree
beforeEach(() => { useUIStore.setState(useUIStore.getInitialState()) })
afterEach(async () => { await act(() => tree.unmount()) })

function host(testID: string) { return tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)[0]! }
function measure(width: number) { return measureSafeArea(tree.toJSON(), node => node.props.testID, { width, height: HEIGHT }) }
async function report(testID: string, width: number) {
  const box = measure(width).get(testID)!
  const onLayout = host(testID).props.onLayout as (event: LayoutChangeEvent) => void
  await act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: box.width, height: box.bottom - box.top } } } as LayoutChangeEvent))
}
function SelectionTray({ active }: Readonly<{ active: boolean }>) {
  useShellComposerSlot(active, <View testID="selection-tray" style={{ height: 72 }} />)
  return <View style={{ flex: 1 }} />
}
async function mountShell(width: number, notice?: React.ReactNode, selecting = false) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 astraButton header={<View style={{ height: 48 }} />} notice={notice}
    fab={<View style={{ height: 60 }} />} tabBar={<View style={{ height: 80 }} />}><SelectionTray active={selecting} /></Shell412>) as GeometryTree })
  for (const testID of ['shell-tab-bar', 'shell-bottom-content']) await report(testID, width)
}
function EmptyNotice() { return null }

it.each([412, 840])('runs the resting Hoje list down to the tab bar at %ipx', async width => {
  await mountShell(width, <><EmptyNotice /><EmptyNotice /></>)
  const boxes = measure(width)
  expect(boxes.get('shell-scroller')!.bottom).toBe(boxes.get('shell-tab-bar')!.top)
  expect(boxes.get('shell-bottom')!.top).toBe(boxes.get('shell-tab-bar')!.top)
})

it('pins the selection tray above the tab bar and ends the list at the tray', async () => {
  await mountShell(412, <EmptyNotice />, true)
  await report('shell-bottom-content', 412)
  const boxes = measure(412)
  expect(boxes.get('selection-tray')!.bottom).toBeLessThanOrEqual(boxes.get('shell-tab-bar')!.top)
  expect(boxes.get('selection-tray')!.bottom - boxes.get('selection-tray')!.top).toBe(72)
  expect(boxes.get('shell-scroller')!.bottom).toBe(boxes.get('shell-bottom')!.top)
  expect(boxes.get('shell-scroller')!.bottom).toBeLessThanOrEqual(boxes.get('selection-tray')!.top)
})
