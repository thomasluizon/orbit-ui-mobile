import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import type { DayCellProps, DayCellWords } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName } from '@orbit/shared/utils'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { createStyles as createCalendarSyncStyles } from '@/components/calendar-sync/calendar-import-styles'
import { DayCell } from '@/components/dates/day-cell'
import { Chip } from '@/components/ui/chip'
import { ListRow } from '@/components/ui/list-row'
import { createTokensV2, radius } from '@/lib/theme'

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time, uses24HourClock: true }),
}))

type StyledNode = Readonly<{
  props: {
    style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>)
    accessibilityLabel?: string
    onPressIn?: () => void
    onPressOut?: () => void
  }
  findAllByType(type: unknown): StyledNode[]
  findAllByProps(props: Record<string, unknown>): StyledNode[]
}>

type TestTree = Readonly<{ root: StyledNode; unmount(): void }>

const renderer = require('react-test-renderer') as {
  create(element: React.ReactElement): TestTree
  act(callback: () => void): void
}

const tokens = createTokensV2('purple', 'dark')

const cellWords: DayCellWords = {
  none: 'none',
  partial: 'partial',
  full: 'full',
  notScheduled: 'not scheduled',
  of: 'of',
  today: 'today',
  readOnly: 'read only',
}

const loggableFullDay = { day: 15, label: 'March 15', words: cellWords, done: 1, scheduled: 1, loggable: true, onPress: () => {} } as const
const readOnlyFullDay = { day: 15, label: 'March 15', words: cellWords, done: 1, scheduled: 1 } as const

function withTree<T>(element: React.ReactElement, read: (tree: TestTree) => T) {
  let created: TestTree | undefined
  renderer.act(() => { created = renderer.create(element) })
  if (!created) throw new Error('The renderer produced no tree')
  const tree = created
  const result = read(tree)
  renderer.act(() => tree.unmount())
  return result
}

function findPressable(tree: TestTree, label: string) {
  const control = tree.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)
  if (!control) throw new Error(`Missing control: ${label}`)
  return control
}

function pressedFill(node: StyledNode, pressed: boolean) {
  const style = node.props.style
  if (typeof style !== 'function') throw new Error('The control does not style itself from Pressable state')
  return StyleSheet.flatten(style({ pressed }))
}

function pressedStyle(element: React.ReactElement, label: string) {
  return withTree(element, (tree) => pressedFill(findPressable(tree, label), true))
}

function discFill(node: StyledNode) {
  return StyleSheet.flatten(node.findAllByProps({ testID: 'day-disc' })[0]!.props.style as StyleProp<ViewStyle>).backgroundColor
}

function numeralColor(node: StyledNode) {
  return StyleSheet.flatten(node.findAllByType(Text)[0]!.props.style as StyleProp<TextStyle>).color
}

describe('pressed hit area shapes', () => {
  it('fills the whole rounded ListRow body and its round action', () => {
    const row = <ListRow title="Account" accessibilityLabel="Account" onClick={() => {}} action={{ icon: 'download', label: 'More', onPress: () => {} }} />
    expect(pressedStyle(row, 'Account')).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
    expect(pressedStyle(row, 'More')).toMatchObject({ borderRadius: 999, overflow: 'hidden', backgroundColor: tokens.bgHover })
  })

  it('clips the chip press fill to its pill hit area', () => {
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Active">Active</Chip>, 'Active')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden' })
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Selected" active>Selected</Chip>, 'Selected')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden', backgroundColor: tokens.bgHover })
  })

  it('moves a loggable completed day fill onto the round hit area so the press stays visible', () => {
    const label = buildDayCellAccessibleName(loggableFullDay, 'full')
    const cell = <DayCell {...loggableFullDay} />

    expect(pressedStyle(cell, label)).toMatchObject({ borderRadius: 22, overflow: 'hidden', backgroundColor: tokens.bgHover })
    withTree(cell, (tree) => {
      const control = findPressable(tree, label)
      expect(pressedFill(control, false)).toMatchObject({ backgroundColor: tokens.fg1 })
      expect(discFill(control)).toBe('transparent')
      expect(numeralColor(control)).toBe(tokens.bg)
    })
  })

  it('flips the completed day numeral onto the press fill so it stays legible', () => {
    const label = buildDayCellAccessibleName(loggableFullDay, 'full')
    withTree(<DayCell {...loggableFullDay} />, (tree) => {
      const control = findPressable(tree, label)
      expect(numeralColor(control)).toBe(tokens.bg)
      renderer.act(() => control.props.onPressIn?.())
      expect(numeralColor(findPressable(tree, label))).toBe(tokens.fg1)
      renderer.act(() => control.props.onPressOut?.())
      expect(numeralColor(findPressable(tree, label))).toBe(tokens.bg)
    })
  })

  it('keeps a read-only completed day fill on its own disc', () => {
    withTree(<DayCell {...readOnlyFullDay} />, (tree) => {
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
      expect(discFill(tree.root)).toBe(tokens.fg1)
    })
  })

  it('clips the calendar sync row press fill to the row radius', () => {
    const event = { id: 'e1', title: 'Weekly review', description: null, startDate: null, startTime: null, endTime: null, startUtc: null, recurrenceTimeZone: null, isRecurring: false, recurrenceRule: null, reminders: [] }
    const row = (
      <CalendarSyncEventRow
        event={event}
        weekStartDay={1}
        selected={false}
        isReviewMode={false}
        suggestionId={null}
        dismissPending={false}
        styles={createCalendarSyncStyles()}
        tokens={tokens}
        t={((key: string) => key) as never}
        onToggle={() => {}}
        onDismiss={() => {}}
      />
    )

    withTree(row, (tree) => {
      const control = tree.root.findAllByType(Pressable)[0]!
      expect(pressedFill(control, true)).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgElev })
      expect(pressedFill(control, false).backgroundColor).toBe('transparent')
    })
  })
})
