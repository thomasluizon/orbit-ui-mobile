import React from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASTRA_BUTTON_GAP } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useUIStore } from '@/stores/ui-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/motion', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => true }))

const HEIGHT = 915
let tree: GeometryTree
const clearances: number[] = []

beforeEach(() => { clearances.length = 0; useUIStore.setState(useUIStore.getInitialState()) })
afterEach(async () => { await act(() => tree.unmount()) })

function hosts(testID: string) { return tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID) }
function host(testID: string) { return hosts(testID)[0]! }
function measure(width: number) { return measureSafeArea(tree.toJSON(), node => node.props.testID, { width, height: HEIGHT }) }
async function reportLayouts(width: number) {
  for (const node of tree.root.findAll(candidate => typeof candidate.type === 'string' && typeof candidate.props.onLayout === 'function' && typeof candidate.props.testID === 'string')) {
    const box = measure(width).get(node.props.testID as string)
    if (!box) continue
    await act(() => (node.props.onLayout as (event: LayoutChangeEvent) => void)({ nativeEvent: { layout: { x: box.left, y: box.top, width: box.width, height: box.bottom - box.top } } } as LayoutChangeEvent))
  }
}
function ClearanceProbe() {
  clearances.push(useShellScrollerClearance())
  return <View testID="last-row" style={{ height: 56 }} />
}
function CreateFab() { return <View testID="create-fab" style={{ width: 60, height: 60 }} /> }

async function mountShell(width: number, { fab = true, astraButton = true } = {}) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => {
    tree = create(<Shell412 astraButton={astraButton} header={<View style={{ height: 48 }} />} fab={fab ? <CreateFab /> : undefined}
      tabBar={<View testID="tab-bar" style={{ height: 80 }} />}><ClearanceProbe /></Shell412>) as GeometryTree
  })
  await reportLayouts(width)
}

function responderKeys(node: ReactTestInstance | null): string[] {
  const keys: string[] = []
  for (let current = node; current; current = current.parent) {
    if (typeof current.type !== 'string') continue
    keys.push(...Object.keys(current.props).filter(key => /^onResponder|ShouldSetResponder|^onLongPress$|^onAccessibilityAction$/.test(key)))
  }
  return keys
}

describe.each([412, 840])('the compact Astra button at %ipx', width => {
  it('sits directly above the create habit button, centred on it, with the shared gap', async () => {
    await mountShell(width)
    const boxes = measure(width)
    const astra = boxes.get('astra-button')!
    const create = boxes.get('create-fab')!
    expect(astra.width).toBe(60)
    expect(astra.bottom - astra.top).toBe(60)
    expect(create.top - astra.bottom).toBe(ASTRA_BUTTON_GAP)
    expect(astra.left + astra.width / 2).toBe(create.left + create.width / 2)
    expect(astra.bottom).toBeLessThanOrEqual(boxes.get('shell-tab-bar')!.top)
  })

  it('takes the create habit button position when that button is absent', async () => {
    await mountShell(width)
    const stacked = measure(width).get('create-fab')!
    await act(() => tree.unmount())
    await mountShell(width, { fab: false })
    const alone = measure(width).get('astra-button')!
    expect(hosts('create-fab')).toHaveLength(0)
    expect({ left: alone.left, top: alone.top }).toEqual({ left: stacked.left, top: stacked.top })
  })

  it('keeps the last Hoje row clear of both stacked buttons and the tab bar', async () => {
    await mountShell(width)
    const boxes = measure(width)
    const clearance = clearances.at(-1)!
    const scrollerBottom = boxes.get('shell-scroller')!.bottom
    expect(scrollerBottom).toBeLessThanOrEqual(boxes.get('shell-tab-bar')!.top)
    expect(scrollerBottom - clearance).toBeLessThanOrEqual(boxes.get('astra-button')!.top - SPACING.s16)
  })
})

it('opens Astra on tap and carries its accessible name', async () => {
  await mountShell(412)
  expect(host('astra-button').props.accessibilityLabel).toBe('shell.astraButton.open')
  await act(() => { (host('astra-button').props.onPress as () => void)() })
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(hosts('astra-button')).toHaveLength(0)
})

it('stays in place through a drag and offers no move gesture or action', async () => {
  await mountShell(412)
  const before = measure(412).get('astra-button')!
  const button = host('astra-button')
  expect(responderKeys(button)).toEqual([])
  expect(button.props.accessibilityActions).toBeUndefined()
  await act(() => {
    ;(button.props.onPressIn as () => void)()
    ;(button.props.onPressOut as () => void)()
  })
  await reportLayouts(412)
  expect(measure(412).get('astra-button')).toEqual(before)
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('hides while selection mode owns the bottom of Hoje and returns to the stack after it', async () => {
  await mountShell(412)
  await act(() => { useUIStore.setState({ isSelectMode: true }) })
  expect(hosts('astra-button')).toHaveLength(0)
  await act(() => { useUIStore.setState({ isSelectMode: false }) })
  const boxes = measure(412)
  expect(boxes.get('create-fab')!.top - boxes.get('astra-button')!.bottom).toBe(ASTRA_BUTTON_GAP)
})
