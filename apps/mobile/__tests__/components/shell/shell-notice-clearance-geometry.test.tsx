import React from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import { Shell412 } from '@/components/shell/shell-412'
import { Toast } from '@/components/ui/app-toast'
import { useUIStore } from '@/stores/ui-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/motion', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => true }))

const HEIGHT = 915
const SHARED_GAP = SPACING.s24
let tree: GeometryTree
beforeEach(() => { useUIStore.setState(useUIStore.getInitialState()) })
afterEach(async () => { await act(() => tree.unmount()) })

function host(testID: string) { return tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)[0] }
function measure(width: number) { return measureSafeArea(tree.toJSON(), node => node.props.testID, { width, height: HEIGHT }) }
async function report(testID: string, width: number) {
  const box = measure(width).get(testID)
  const onLayout = host(testID)?.props.onLayout as ((event: LayoutChangeEvent) => void) | undefined
  if (!box || !onLayout) return
  await act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: box.width, height: box.bottom - box.top } } } as LayoutChangeEvent))
}

async function mountShell(width: number, today: boolean, notice?: React.ReactNode) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 astraButton={today} header={<View style={{ height: 48 }} />} notice={notice}
    fab={today ? <View testID="create-fab" style={{ width: 60, height: 60 }} /> : undefined} tabBar={<View style={{ height: 80 }} />}>
    <View style={{ flex: 1 }} />
  </Shell412>) as GeometryTree })
  for (const testID of ['shell-notice-content', 'shell-bottom', 'shell-tab-bar', 'shell-bottom-content', 'astra-button-area']) await report(testID, width)
}

const toast = <Toast kind="neutral" message="O aviso saiu da lista." actionLabel="Desfazer" onAction={vi.fn()} persistent />

it.each([412, 840])('ends the toast the shared gap above the tab bar at %ipx', async width => {
  await mountShell(width, false, toast)
  const boxes = measure(width)
  expect(boxes.get('shell-tab-bar')!.top - boxes.get('toast-neutral')!.bottom).toBeGreaterThanOrEqual(SHARED_GAP)
})

it('keeps the toast clear of the tab bar, the create button and the Astra button on Hoje', async () => {
  await mountShell(412, true, toast)
  const boxes = measure(412)
  const placed = boxes.get('toast-neutral')!
  expect(boxes.get('shell-tab-bar')!.top - placed.bottom).toBeGreaterThanOrEqual(SHARED_GAP)
  expect(placed.top - boxes.get('create-fab')!.bottom).toBeGreaterThanOrEqual(SHARED_GAP)
  const position = host('astra-button-position')!
  const transform = (position.props.style as [unknown, { transform: { translateY?: number | { value: number } }[] }])[1].transform
  const translateY = transform.find(entry => entry.translateY !== undefined)!.translateY!
  const astraBottom = boxes.get('astra-button-area')!.top + (typeof translateY === 'number' ? translateY : translateY.value) + 60
  expect(placed.top - astraBottom).toBeGreaterThanOrEqual(SPACING.s16)
})

it('reserves no clearance while the notice slot is empty', async () => {
  await mountShell(412, false, <></>)
  const boxes = measure(412)
  expect(boxes.get('shell-tab-bar')!.top - boxes.get('shell-notice')!.bottom).toBe(0)
  expect(boxes.get('shell-notice')!.bottom - boxes.get('shell-notice')!.top).toBe(0)
})
