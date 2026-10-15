import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { FlowShell } from '@/components/shell/flow-shell'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'
import { WrappedSlide } from '@/components/wrapped/wrapped-slide'
import { createTokensV2 } from '@/lib/theme'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: { screen: { backgroundColor: '#111111' } } }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: (props: React.ComponentProps<typeof View>) => <View {...props} /> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))

const tokens = createTokensV2()
const noop = () => {}
const recap = createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: 2 }) })
const activeDays = buildWrappedSlides(recap).find((slide) => slide.id === 'activeDays')!

it.each([412, 1200, 1600])('centres standalone flow content and bounds its pinned action at %ipx', async (width) => {
  let tree!: GeometryTree
  await act(() => { tree = create(<FlowShell nav={false} action={<View testID="action" style={{ height: 48 }} />}><View testID="body" style={{ height: 100 }} /></FlowShell>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: 900 })
    const body = boxes.get('body')!
    const action = boxes.get('action')!
    expect(body.width).toBe(Math.min(width, 740) - 32)
    expect(body.left + body.width / 2).toBe(width / 2)
    expect(body.top).toBeGreaterThan(300)
    expect(action.width).toBeLessThanOrEqual(708)
    expect(action.left + action.width / 2).toBe(width / 2)
  } finally { await act(() => tree.unmount()) }
})

it.each([412, 1200, 1600])('centres the Wrapped cover and limits its primary action at %ipx', async (width) => {
  let tree!: GeometryTree
  await act(() => { tree = create(<View style={{ flex: 1 }}><WrappedCover tokens={tokens} period="month" state="ready" onStart={noop} onRetry={noop} onSelectPeriod={noop} /></View>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.accessibilityRole === 'header' ? 'heading' : host.props.testID === 'button-primary-md' ? 'start' : undefined, { width, height: 900 })
    const heading = boxes.get('heading')!
    expect(heading.left + heading.width / 2).toBe(width / 2)
    const start = boxes.get('start')!
    expect(start.width).toBeLessThanOrEqual(360)
    expect(start.left + start.width / 2).toBe(width / 2)
  } finally { await act(() => tree.unmount()) }
})

it.each([412, 1200, 1600])('centres a Wrapped figure inside the content cap at %ipx', async (width) => {
  let tree!: GeometryTree
  await act(() => { tree = create(<View style={{ flex: 1 }}><WrappedSlide slide={activeDays} recap={recap} period="month" tokens={tokens} shareRef={null} shareError={false} savedFileName={null} /></View>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: 900 })
    const slide = boxes.get('wrapped-slide-activeDays')!
    const figure = boxes.get('wrapped-figure')!
    expect(slide.width).toBe(Math.min(width, 740))
    expect(figure.left + figure.width / 2).toBe(width / 2)
    expect(figure.top).toBeGreaterThan(300)
  } finally { await act(() => tree.unmount()) }
})
