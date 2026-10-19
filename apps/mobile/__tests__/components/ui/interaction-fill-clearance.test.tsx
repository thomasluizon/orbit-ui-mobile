import React from 'react'
import { act, create } from 'react-test-renderer'
import { Text, View } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Chip } from '@/components/ui/chip'
import { ActionRow } from '@/components/ui/action-row'
import { hasPaint, measureInteractionFills, paintedExtent } from '@/__tests__/support/interaction-fill-geometry'
import type { GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn(), getString: vi.fn().mockResolvedValue('') } }))
vi.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: makeHabitDetail(), isLoading: false, isError: false }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  useHabits: () => ({ data: { habitsById: new Map([['habit-1', makeHabitDetailScopedParent()]]) }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: vi.fn() }), useUpdateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateChecklist: () => ({ mutateAsync: vi.fn() }), useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null }) }))
vi.mock('@/app/(tabs)/use-today-date', () => ({ useCurrentDate: () => '2026-09-04' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: { screen: { backgroundColor: '#09090B' } } }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/habit-detail-fields', () => ({ HabitDetailFields: () => null, HabitDetailSchedule: () => null }))

type Host = Parameters<typeof measureInteractionFills>[0]
type Box = ReturnType<typeof measureInteractionFills>[number]

function findHeader(host: Host | Host[]): Host | undefined {
  if (Array.isArray(host)) return host.map(findHeader).find(Boolean)
  if (host.props.testID === 'habit-detail-header-row') return host
  for (const child of host.children ?? []) {
    if (typeof child !== 'string') { const found = findHeader(child); if (found) return found }
  }
}

function fillBox(parts: Box[], control: Box) {
  const painted = parts.filter((part) => (part.slot === control.slot || part.ancestors.includes(control.slot)) && hasPaint(part.style))
  expect(painted.length, control.host.props.accessibilityLabel).toBeGreaterThan(0)
  return {
    left: Math.min(control.left, ...painted.map((part) => part.left - paintedExtent(part.style))),
    right: Math.max(control.right, ...painted.map((part) => part.right + paintedExtent(part.style))),
    top: Math.min(control.top, ...painted.map((part) => part.top - paintedExtent(part.style))),
    bottom: Math.max(control.bottom, ...painted.map((part) => part.bottom + paintedExtent(part.style))),
  }
}

async function setInteraction(tree: GeometryTree, label: string, state: 'pressed' | 'focused') {
  const control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === label)[0]!
  expect(control).toBeDefined()
  await act(() => state === 'pressed' ? (control.props.onPressIn as () => void)() : (control.props.onFocus as (event: unknown) => void)({ target: 1, currentTarget: 1, nativeEvent: { target: 1 } }))
}

describe('Android interaction fill clearance', () => {
  it.each([320, 412, 600, 1024, 1352].flatMap((width) => (['pressed', 'focused'] as const).map((state) => ({ width, state }))))('clears the title neighbours at $width while $state', async ({ width, state }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: GeometryTree
    await act(() => { tree = create(<HabitDetailScreen habitId="habit-1" />) as GeometryTree })
    try {
      await setInteraction(tree, makeHabitDetail().title, state)
      const header = findHeader(tree.toJSON())!
      const parts = measureInteractionFills({ type: 'View', props: { style: { paddingHorizontal: 16 } }, children: [header] }, Math.min(width, 740), state === 'pressed')
      const title = parts.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === makeHabitDetail().title)!
      const fill = fillBox(parts, title)
      const actions = parts.find((part) => part.ancestors.length === 2)!
      const summary = parts.find((part) => part.host.type === 'Text' && part.top >= title.bottom && !part.ancestors.includes(title.slot))!
      expect(fill.top - actions.bottom, 'emoji row to title fill').toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      expect(summary.top - fill.bottom, 'title fill to frequency summary').toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      expect(fill.left, 'leading page clearance').toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      expect(Math.min(width, 740) - fill.right, 'trailing page clearance').toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    } finally { await act(() => tree.unmount()) }
  })

  it.each(['row', 'pill', 'icon', 'chip'].flatMap((primitive) => (['pressed', 'focused'] as const).map((state) => ({ primitive, state }))))('contains the $primitive fill while $state', async ({ primitive, state }) => {
    const surface = primitive === 'row' ? <View style={{ gap: 4 }}><ListRow accessibilityLabel="First" title="First" onClick={vi.fn()} /><ListRow title="Next" onClick={vi.fn()} /></View>
      : primitive === 'chip' ? <View style={{ flexDirection: 'row', gap: 8 }}><Chip accessibilityLabel="First">First</Chip><Chip>Next</Chip></View>
        : <ActionRow>{primitive === 'icon' ? <PillButton iconOnly label="First"><Text>+</Text></PillButton> : <PillButton accessibleName="First">First</PillButton>}<PillButton>Next</PillButton></ActionRow>
    let tree!: GeometryTree
    await act(() => { tree = create(<View style={{ padding: 16 }}>{surface}</View>) as GeometryTree })
    try {
      await setInteraction(tree, 'First', state)
      const parts = measureInteractionFills(tree.toJSON(), 412, state === 'pressed')
      const control = parts.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === 'First')!
      const fill = fillBox(parts, control)
      const neighbour = parts.find((part) => part.host.type === 'Pressable' && part.slot !== control.slot)!
      const horizontal = neighbour.left >= control.right
      const gap = horizontal ? neighbour.left - control.right : neighbour.top - control.bottom
      const extension = Math.max(control.left - fill.left, fill.right - control.right, control.top - fill.top, fill.bottom - control.bottom)
      expect(extension).toBeLessThanOrEqual(Math.max(0, gap - INTERACTION_FILL_CLEARANCE))
      expect(horizontal ? neighbour.left - fill.right : neighbour.top - fill.bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    } finally { await act(() => tree.unmount()) }
  })
})
