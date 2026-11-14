import React, { type ComponentProps, type ReactElement } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotFoundScreen from '@/app/+not-found'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { createStyles as createChatStyles } from '@/components/chat/conversation.styles'
import { Shell412 } from '@/components/shell/shell-412'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { ThrottleScreen } from '@/components/throttle-screen'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { EmptyState } from '@/components/ui/empty-state'
import { OverlayHost } from '@/components/ui/overlay-host'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useThrottleStore } from '@/stores/throttle-store'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
  SafeAreaView: ({ edges = ['top', 'bottom'], style, ...props }: ComponentProps<typeof View> & { edges?: readonly string[] }) =>
    <View {...props} style={[StyleSheet.flatten(style), { paddingTop: edges.includes('top') ? 24 : 0, paddingBottom: edges.includes('bottom') ? 24 : 0 }]} />,
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }))

const HEIGHT = 915
const INSET = 24
let tree: GeometryTree
afterEach(async () => {
  await act(() => tree.unmount())
  useThrottleStore.getState().clear()
})

const noop = () => {}
const chatStyles = createChatStyles(createTokensV2('orange', 'dark'))
/** A destination's own scroller inside the shell, as Metas and Avisos draw it: it grows to the free area and keeps the shell clearance at its end. */
function DestinationScroller({ children }: Readonly<{ children: ReactElement }>) {
  return <ScrollView testID="destination-scroller" contentContainerStyle={{ flexGrow: 1, paddingBottom: useShellScrollerClearance() }}>{children}</ScrollView>
}
const inShell = (children: ReactElement) => <Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}>{children}</Shell412>

/** The free area runs from the top of the scroller that owns the block (a destination's scroller, or the shell's for a surface with its own) to the tab bar, or covers the safe area of a root surface. */
type Free = 'destination' | 'shell' | 'safe-area'

const surfaces: { name: string; free: Free; element: () => ReactElement }[] = [
  { name: 'empty', free: 'destination', element: () => inShell(<DestinationScroller><ShellCentredRegion><EmptyState title="Nenhuma meta ainda" action={<PillButton>Criar meta</PillButton>} /></ShellCentredRegion></DestinationScroller>) },
  { name: 'error', free: 'safe-area', element: () => <AppErrorScreen error={new Error('boom')} retry={noop} standalone /> },
  { name: 'failure', free: 'safe-area', element: () => <AppErrorScreen error={{ status: 500, data: { requestId: 'req-42' } }} retry={noop} standalone /> },
  { name: 'offline', free: 'shell', element: () => inShell(<ChatEmptyState styles={chatStyles} mascotState="descansando" browseAction={<PillButton variant="ghost">Ver ideias</PillButton>} />) },
  { name: 'throttle', free: 'safe-area', element: () => { useThrottleStore.getState().show(429, { retryAfterUtc: new Date(Date.now() + 60_000).toISOString() }); return <OverlayHost><ThrottleScreen /></OverlayHost> } },
]

/** Every part of a state block: the empty state, or each child of the error surface around the mascot. */
function blockParts(root: GeometryHost): GeometryHost[] {
  const hosts: GeometryHost[] = []
  const walk = (host: GeometryHost) => { hosts.push(host); for (const child of host.children ?? []) if (typeof child !== 'string') walk(child) }
  walk(root)
  const empty = hosts.find(host => host.props.testID === 'empty-state')
  if (empty) return [empty]
  const surface = hosts.find(host => host.type === 'ScrollView' && (host.children ?? []).some(child => typeof child !== 'string' && child.props.testID === 'orbit-mascot'))!
  return (surface.children ?? []).filter((child): child is GeometryHost => typeof child !== 'string')
}

const cases = surfaces.flatMap(surface => [320, 360, 384, 412].map(width => ({ ...surface, width })))

async function measureBlock(element: ReactElement, width: number) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>) as GeometryTree })
  const roots = tree.toJSON() as GeometryHost | GeometryHost[]
  const root = Array.isArray(roots) ? roots.find(host => host.type === 'Modal')! : roots
  const parts = new Map(blockParts(root).map((host, index) => [host, `part-${index}`]))
  const boxes = measureSafeArea(root, host => parts.get(host) ?? host.props.testID, { width, height: HEIGHT })
  const blocks = [...parts.values()].map(key => boxes.get(key)!)
  return { boxes, block: { top: Math.min(...blocks.map(box => box.top)), bottom: Math.max(...blocks.map(box => box.bottom)) } }
}

it.each(cases)('centres the $name block within 1px of its free area at $width px', async ({ free, element, width }) => {
  const { boxes, block } = await measureBlock(element(), width)
  const area = free === 'safe-area' ? { top: INSET, bottom: HEIGHT - INSET }
    : { top: boxes.get(free === 'shell' ? 'shell-scroller' : 'destination-scroller')!.top, bottom: boxes.get('tab-bar')!.top }
  expect(area.bottom - area.top).toBeGreaterThan(block.bottom - block.top)
  expect(Math.abs((block.top + block.bottom) / 2 - (area.top + area.bottom) / 2), JSON.stringify({ area, block })).toBeLessThanOrEqual(1)
})

/** Android has one not-found route, drawn as the web in-shell variant: the block starts 64 below the top, not centred. */
it.each([320, 360, 384, 412])('keeps the not-found block on the drawn 64 start edge at %i px, as the in-shell web variant does', async (width) => {
  const { block } = await measureBlock(<NotFoundScreen />, width)
  expect(block.top).toBe(64)
})
