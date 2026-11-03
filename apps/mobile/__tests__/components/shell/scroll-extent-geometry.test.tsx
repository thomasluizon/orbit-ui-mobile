import React from 'react'
import { ScrollView, View, type LayoutChangeEvent } from 'react-native'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useListScrollReservation } from '@/hooks/use-list-scroll-reservation'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { SPACING } from '@orbit/shared/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }))

function LongList({ height = 1600 }: Readonly<{ height?: number }>) {
  const clearance = useShellScrollerClearance()
  const reservation = useListScrollReservation()
  return <ScrollView testID="list" style={{ flex: 1 }} onLayout={reservation.onLayout}
    contentContainerStyle={{ minHeight: reservation.minimumHeight, paddingBottom: clearance }}>
    <View testID="last-content" style={{ height }} />
  </ScrollView>
}

function exposeContent(host: GeometryHost): GeometryHost {
  const children = host.children?.map(child => typeof child === 'string' ? child : exposeContent(child)) ?? null
  if (host.props.testID !== 'list') return { ...host, children }
  const { contentContainerStyle, ...props } = host.props
  return { ...host, props, children: [{ type: 'View', props: { testID: 'list-content', style: contentContainerStyle }, children }] }
}

const destinations = ['hoje', 'calendar', 'progress', 'profile', 'habit-detail'] as const
const viewports = [{ width: 390, height: 915 }, { width: 840, height: 915 }, { width: 1024, height: 915 },
  { width: 1280, height: 915 }, { width: 1440, height: 915 }, { width: 900, height: 600 }]

it.each(viewports.flatMap(viewport => destinations.map(destination => ({ ...viewport, destination }))))(
  'bounds native $destination content at $width by $height', async ({ width, height, destination }) => {
    __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
    const pinned = destination === 'hoje' || destination === 'habit-detail'
    let tree!: GeometryTree
    await act(() => { tree = create(<Shell412 header={<View style={{ height: 48 }} />}
      composer={pinned ? <View style={{ height: 80 }} /> : undefined}
      fab={destination === 'hoje' ? <View style={{ height: 60 }} /> : undefined}
      tabBar={<View style={{ height: 80 }} />}><LongList /></Shell412>) as GeometryTree })
    try {
      const measure = () => measureSafeArea(exposeContent(tree.toJSON()), host => host.props.testID, { width, height })
      const initial = measure()
      const list = initial.get('list')!
      const findList = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'list')[0]!
      const onLayout = findList().props.onLayout as (event: LayoutChangeEvent) => void
      await act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: list.bottom - list.top } } } as LayoutChangeEvent))
      const contentHeight = initial.get('list-content')!.bottom - initial.get('list-content')!.top
      const maximum = contentHeight - (list.bottom - list.top)
      const boxes = measure()
      const content = boxes.get('list-content')!
      expect(content.bottom - content.top).toBe(contentHeight)
      const lastBottom = boxes.get('last-content')!.bottom - maximum
      expect(list.bottom - lastBottom).toBe(pinned ? SPACING.s96 : SPACING.s32)
      expect(boxes.get('shell-bottom')!.top).toBe(list.bottom)
    } finally { await act(() => tree.unmount()) }
  },
)

it.each(viewports)('releases native minimum height after rows leave at $width by $height', async ({ width, height }) => {
  __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
  const shell = (contentHeight: number) => <Shell412 header={<View style={{ height: 48 }} />}
    composer={<View style={{ height: 80 }} />} tabBar={<View style={{ height: 80 }} />}><LongList height={contentHeight} /></Shell412>
  let tree!: GeometryTree
  await act(() => { tree = create(shell(1600)) as GeometryTree })
  try {
    const measure = () => measureSafeArea(exposeContent(tree.toJSON()), host => host.props.testID, { width, height })
    const list = measure().get('list')!
    const host = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'list')[0]!
    const onLayout = host.props.onLayout as (event: LayoutChangeEvent) => void
    await act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: list.bottom - list.top } } } as LayoutChangeEvent))
    await act(() => tree.update(shell(1000)))
    const content = measure().get('list-content')!
    expect(content.bottom - content.top).toBe(1000 + SPACING.s96)
  } finally { await act(() => tree.unmount()) }
})
