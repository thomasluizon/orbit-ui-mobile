import React from 'react'
import { ScrollView, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { CalendarBody } from '@/app/(tabs)/calendar/_components/calendar-body'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { createTokensV2 } from '@/lib/theme'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))

const HEIGHT = 915
const tokens = createTokensV2('orange', 'dark')
function Scroller({ children }: Readonly<{ children: React.ReactNode }>) {
  const clearance = useShellScrollerClearance()
  return <ScrollView testID="calendar-scroller" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: clearance }}>{children}</ScrollView>
}

let tree: GeometryTree
afterEach(async () => { await act(() => tree.unmount()) })

it.each([320, 360, 384, 412].flatMap((width) => ([['profile'], ['month']] as const).map(([failed]) => ({ width, failed }))))('centres the Calendário load error of the $failed read in the free area under the header at $width px', async ({ width, failed }) => {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  const profile = failed === 'profile'
  await act(() => {
    tree = create(<Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}>
      <Scroller>
        <View style={{ flex: 1 }}>
          <View testID="calendar-header" style={{ height: 220 }} />
          <CalendarBody profileReady={!profile} profileError={profile ? new Error('profile unavailable') : null} onRetryProfile={vi.fn()} error={profile ? null : 'month unavailable'} onRetry={vi.fn()} tokens={tokens}><></></CalendarBody>
        </View>
      </Scroller>
    </Shell412>) as GeometryTree
  })
  const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
  const free = { top: boxes.get('calendar-header')!.bottom, bottom: boxes.get('tab-bar')!.top }
  const group = boxes.get('error-state')!
  expect(free.bottom - free.top).toBeGreaterThan(group.bottom - group.top)
  expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  const mascots = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
  expect(mascots.map((mascot) => mascot.props['data-orbit-state'] as string)).toEqual(['parado'])
})
