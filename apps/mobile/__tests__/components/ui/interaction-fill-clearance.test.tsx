import React from 'react'
import { act, create } from 'react-test-renderer'
import { Text, View } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { INTERACTION_FILL_CLEARANCE, PADDING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Chip } from '@/components/ui/chip'
import { ActionRow } from '@/components/ui/action-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { CalendarHeader } from '@/app/(tabs)/calendar/_components/calendar-shell'
import { Composer } from '@/components/shell/composer'
import { Shell412 } from '@/components/shell/shell-412'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { createTokensV2 } from '@/lib/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
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

function findHost(host: Host | Host[], testID: string): Host | undefined {
  if (Array.isArray(host)) return host.map((child) => findHost(child, testID)).find(Boolean)
  if (host.props.testID === testID) return host
  for (const child of host.children ?? []) {
    if (typeof child !== 'string') { const found = findHost(child, testID); if (found) return found }
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
  it.each([320, 412, 600, 1024, 1352].flatMap(width => [en, ptBR].flatMap(messages =>
    (['pressed', 'focused'] as const).map(state => ({ width, messages, state })))))(
    'insets the habit detail composer at $width while $state', async ({ width, messages, state }) => {
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
      let tree!: GeometryTree
      await act(() => {
        tree = create(<Shell412 tabBar={<BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
          items={(['today', 'calendar', 'progress', 'profile'] as const).map(id => ({ id, label: messages.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} />}
          composer={<Composer state="idle" value="" suggestions={[]} words={messages.shell.composer}
          onChangeValue={vi.fn()} onSend={vi.fn()} onRetry={vi.fn()} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />}>
          <HabitDetailScreen habitId="habit-1" />
        </Shell412>) as GeometryTree
      })
      try {
        if (state === 'pressed') await setInteraction(tree, messages.todayAstra.openConversation, state)
        else {
          const input = tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === messages.shell.composer.inputLabel)[0]!
          await act(() => (input.props.onFocus as () => void)())
        }
        const pinned = findHost(tree.toJSON(), 'shell-pinned-slot')!
        const columnWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH)
        const parts = measureInteractionFills(pinned, columnWidth, state === 'pressed')
        const field = parts.find(part => part.host.props.testID === 'composer-field')!
        const paint = fillBox(parts, field)
        const retryText = parts.find(part => part.host.type === 'Text' && part.host.children?.includes(messages.shell.composer.retry))!
        const retry = parts.find(part => part.host.type === 'Pressable' && retryText.ancestors.includes(part.slot))!
        expect(paint.left).toBe(PADDING.screenGutter)
        expect(columnWidth - paint.right).toBe(PADDING.screenGutter)
        expect(paint.left).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
        expect(columnWidth - paint.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
        expect(field.bottom - field.top).toBeGreaterThanOrEqual(56)
        expect(retry.top - field.bottom).toBe(12)
      } finally { await act(() => tree.unmount()) }
    })

  it.each(['rows', 'rowsWithAction', 'calendar', 'composer', 'tabs'].flatMap((surface) => (['pressed', 'focused'] as const).map((state) => ({ surface, state }))))('clears adjacent $surface paint while $state', async ({ surface, state }) => {
    const tokens = createTokensV2('orange', 'dark')
    const surfaces = {
      rows: <SettingsGroup><ListRow accessibilityLabel="First" title="First" onClick={vi.fn()} /><ListRow title="Next" onClick={vi.fn()} /></SettingsGroup>,
      rowsWithAction: <SettingsGroup><ListRow accessibilityLabel="First" title="First" onClick={vi.fn()} action={{ icon: 'trash', label: 'Remove row', onPress: vi.fn() }} /><ListRow title="Next" onClick={vi.fn()} /></SettingsGroup>,
      calendar: <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-12" tokens={tokens}
        previousMonthLabel="Previous" nextMonthLabel="Next" onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />,
      composer: <Composer state="idle" value="Message" suggestions={[]} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()}
        onAttachFile={vi.fn()} attachWords={{ ...en.shell.composer.attach, remove: (name: string) => name }} />,
      tabs: <BottomTabBar label="Destinations" activeId="today" onSelect={vi.fn()} items={['today', 'calendar', 'progress', 'profile'].map((id) => ({ id, label: id, icon: () => <View style={{ width: 24, height: 24 }} /> }))} />,
    }
    let tree!: GeometryTree
    await act(() => { tree = create(<View>{surfaces[surface as keyof typeof surfaces]}</View>) as GeometryTree })
    try {
      const controls = tree.root.findAll((node) => String(node.type) === 'Pressable')
      const label = String(controls[surface === 'calendar' ? 2 : 0]!.props.accessibilityLabel)
      await setInteraction(tree, label, state)
      const parts = measureInteractionFills(tree.toJSON(), 320, state === 'pressed')
      const control = parts.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === label)!
      const paints = parts.filter((part) => (part.slot === control.slot || part.ancestors.includes(control.slot)) && hasPaint(part.style))
      expect(paints.length, label).toBeGreaterThan(0)
      const fill = { left: Math.min(...paints.map((part) => part.left - paintedExtent(part.style))), right: Math.max(...paints.map((part) => part.right + paintedExtent(part.style))), top: Math.min(...paints.map((part) => part.top - paintedExtent(part.style))), bottom: Math.max(...paints.map((part) => part.bottom + paintedExtent(part.style))) }
      if (surface === 'rows' || surface === 'rowsWithAction') {
        for (const gap of [fill.left - control.left, control.right - fill.right, fill.top - control.top, control.bottom - fill.bottom]) expect(gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      }
      const neighbour = parts.find((part) => part.host.type === 'Pressable' && Number(part.slot) > Number(control.slot) && !part.ancestors.includes(control.slot))!
      const neighbourPaints = parts.filter((part) => part.ancestors.includes(neighbour.slot) && (hasPaint(part.style) || Number(part.style.borderWidth) > 0))
      const neighbourBounds = neighbourPaints.length ? { left: Math.min(...neighbourPaints.map((part) => part.left)), top: Math.min(...neighbourPaints.map((part) => part.top)) } : neighbour
      expect(control.right - control.left).toBeGreaterThanOrEqual(48)
      expect(control.bottom - control.top).toBeGreaterThanOrEqual(48)
      const horizontal = neighbour.left >= control.right
      expect(horizontal ? neighbourBounds.left - fill.right : neighbourBounds.top - fill.bottom, label).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      if (surface === 'tabs') expect(fill.left).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    } finally { await act(() => tree.unmount()) }
  })

  it.each(['pressed', 'focused'] as const)('separates an unscheduled child explanation from its row while %s', async (state) => {
    let tree!: GeometryTree
    await act(() => { tree = create(<HabitDetailScreen habitId="habit-1" />) as GeometryTree })
    try {
      const childGroup = findHost(tree.toJSON(), 'detail-children')!
      expect(childGroup).toBeDefined()
      const parts = measureInteractionFills(childGroup, 320, state === 'pressed')
      const reason = parts.find((part) => part.host.type === 'Text' && part.host.children?.includes('calendar.dayCell.notScheduled'))!
      expect(reason).toBeDefined()
      const row = parts.find((part) => part.host.props.testID === 'habit-row')!
      expect(reason.top - row.bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      const controls = parts.filter((part) => part.host.type === 'Pressable')
      expect(controls.length).toBeGreaterThan(0)
      for (const control of controls) expect(reason.top - control.bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    } finally { await act(() => tree.unmount()) }
  })

  it.each([320, 412, 600, 1024, 1352].flatMap((width) => (['pressed', 'focused'] as const).map((state) => ({ width, state }))))('clears the title neighbours at $width while $state', async ({ width, state }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: GeometryTree
    await act(() => { tree = create(<HabitDetailScreen habitId="habit-1" />) as GeometryTree })
    try {
      await setInteraction(tree, makeHabitDetail().title, state)
      const header = findHost(tree.toJSON(), 'habit-detail-header-row')!
      const parts = measureInteractionFills({ type: 'View', props: { style: { paddingHorizontal: 16 } }, children: [header] }, Math.min(width, 740), state === 'pressed')
      const title = parts.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === makeHabitDetail().title)!
      const fill = fillBox(parts, title)
      const actions = parts.find((part) => part.ancestors.length === 2)!
      const summary = parts.find((part) => part.host.type === 'Text' && part.top >= title.bottom && !part.ancestors.includes(title.slot))!
      expect(parts[1]!.bottom - parts[1]!.top, 'drawn header height').toBeCloseTo(actions.bottom - actions.top + 12 + title.bottom - title.top + 4 + summary.bottom - summary.top)
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
