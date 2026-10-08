import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName } from '@orbit/shared/utils'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { createStyles as createCalendarSyncStyles } from '@/components/calendar-sync/calendar-import-styles'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { createTokensV2, radius } from '@/lib/theme'

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/motion')>(),
  usePrefersReducedMotion: () => motion.reduced,
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time, uses24HourClock: true }),
}))

type StyledNode = Readonly<{
  props: {
    style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>)
    accessibilityLabel?: string
    onPressIn?: () => void
    onPressOut?: () => void
    hitSlop?: unknown
    testID?: string
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
  it.each([false, true])('keeps the fill available with reduced motion: %s', (reduced) => {
    motion.reduced = reduced
    try {
      withTree(<MotionPressable accessibilityLabel="Retry" style={({ pressed }) => ({ backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>Retry</MotionPressable>, (tree) => {
        renderer.act(() => findPressable(tree, 'Retry').props.onPressIn?.())
        const control = findPressable(tree, 'Retry')
        expect(StyleSheet.flatten(control.props.style as StyleProp<ViewStyle>)).toMatchObject({
          backgroundColor: tokens.bgHover,
          transform: [{ scale: reduced ? 1 : 0.96 }],
          ...(reduced ? { transition: 'none' } : {}),
        })
        renderer.act(() => control.props.onPressOut?.())
        expect(StyleSheet.flatten(findPressable(tree, 'Retry').props.style as StyleProp<ViewStyle>)).toMatchObject({ backgroundColor: 'transparent', transform: [{ scale: 1 }] })
      })
    } finally { motion.reduced = false }
  })

  it('paints the chip target in a real 44px box without invisible slop', () => {
    withTree(<Chip onPress={() => {}} accessibilityLabel="Filter">Filter</Chip>, (tree) => {
      const control = findPressable(tree, 'Filter')
      expect(control.props.hitSlop).toBeUndefined()
      expect(pressedFill(control, true)).toMatchObject({ minHeight: 48, minWidth: 48 })
    })
  })

  it('keeps the small pill paint within its reserved 48px hit area', () => {
    withTree(<PillButton size="sm" accessibleName="Copy">Copy</PillButton>, (tree) => {
      const control = findPressable(tree, 'Copy')
      expect(control.props.hitSlop).toBe(2)
      expect(pressedFill(control, true)).toMatchObject({ minHeight: 44, minWidth: 44 })
    })
  })

  it('keeps the today ring out of the layout so its press fill reaches the outer edge', () => {
    const props = { ...loggableFullDay, today: true }
    withTree(<DayCell {...props} />, (tree) => {
      const control = findPressable(tree, buildDayCellAccessibleName(props, 'full'))
      expect(StyleSheet.flatten(control.props.style as StyleProp<ViewStyle>).borderWidth ?? 0).toBe(0)
      renderer.act(() => control.props.onPressIn?.())
      const fill = control.findAllByProps({ testID: 'day-press-fill' })[0]!
      expect(StyleSheet.flatten(fill.props.style as StyleProp<ViewStyle>)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 0 })
    })
  })

  it('fills the whole rounded ListRow body and its round action', () => {
    const row = <ListRow title="Account" accessibilityLabel="Account" onClick={() => {}} action={{ icon: 'download', label: 'More', onPress: () => {} }} />
    expect(pressedStyle(row, 'Account')).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
    expect(pressedStyle(row, 'More')).toMatchObject({ borderRadius: 999, overflow: 'hidden', backgroundColor: tokens.bgHover })
  })

  it('keeps compact and regular ListRow targets at their drawn floors', () => {
    expect(pressedStyle(<ListRow title="Habit" accessibilityLabel="Habit" onClick={() => {}} />, 'Habit').minHeight).toBe(52)
    expect(pressedStyle(<ListRow title="Goal habit" compact={false} accessibilityLabel="Goal habit" onClick={() => {}} />, 'Goal habit').minHeight).toBe(56)
    expect(pressedStyle(<ListRow title="Account" description="account@example.com" accessibilityLabel="Account" onClick={() => {}} />, 'Account').minHeight).toBe(68)
    const row = <ListRow title="Key" accessibilityLabel="Key" compact onClick={() => {}} action={{ icon: 'trash', label: 'Revoke', onPress: () => {} }} />
    expect(pressedStyle(row, 'Key')).toMatchObject({ minHeight: 56, paddingVertical: 4, paddingHorizontal: 16 })
    expect(pressedStyle(row, 'Revoke')).toMatchObject({ width: 48, height: 48, marginVertical: 4, marginEnd: 16, alignSelf: 'center' })
    withTree(row, (tree) => {
      const body = pressedFill(findPressable(tree, 'Key'), false)
      const action = pressedFill(findPressable(tree, 'Revoke'), false)
      expect(Number(body.minHeight)).toBe(Number(action.height) + 2 * Number(action.marginVertical))
    })
  })

  it('fills the compact in-form ListRow body at the row radius', () => {
    const row = <ListRow title="Templates" accessibilityLabel="Templates" compact inForm onClick={() => {}} />
    expect(pressedStyle(row, 'Templates')).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
  })

  it('clips the chip press fill to its pill hit area', () => {
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Active">Active</Chip>, 'Active')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden', backgroundColor: tokens.bgHover })
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Selected" active>Selected</Chip>, 'Selected')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden', backgroundColor: tokens.bgHover })
    withTree(<Chip onPress={() => {}} accessibilityLabel="Selected" active>Selected</Chip>, (tree) => {
      expect(pressedFill(findPressable(tree, 'Selected'), false).backgroundColor).toBe(tokens.selectionBg)
    })
  })

  it('fills the pressed check row at the row radius and clears it on release', () => {
    withTree(<CheckRow label="Water" checked={false} onChange={() => {}} />, (tree) => {
      const control = findPressable(tree, 'Water')
      expect(pressedFill(control, true)).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
      expect(pressedFill(control, false).backgroundColor).toBeUndefined()
    })
  })

  it('fills only an actionable settings group row, at the row radius', () => {
    const rows = <><SettingsGroupRow label="Theme" onPress={() => {}} /><SettingsGroupRow label="Version" /></>

    withTree(rows, (tree) => {
      const action = findPressable(tree, 'Theme')
      expect(pressedFill(action, true)).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
      expect(pressedFill(action, false).backgroundColor).toBeUndefined()
      expect(pressedFill(findPressable(tree, 'Version'), true)).toMatchObject({ borderRadius: 12, overflow: 'hidden' })
      expect(pressedFill(findPressable(tree, 'Version'), true).backgroundColor).toBeUndefined()
    })
  })

  it('layers the day press fill over the whole round hit area without hiding the outcome', () => {
    const label = buildDayCellAccessibleName(loggableFullDay, 'full')

    withTree(<DayCell {...loggableFullDay} />, (tree) => {
      const control = findPressable(tree, label)
      expect(discFill(control)).toBe(tokens.fg1)
      expect(numeralColor(control)).toBe(tokens.bg)
      expect(control.findAllByProps({ testID: 'day-press-fill' })).toHaveLength(0)

      renderer.act(() => control.props.onPressIn?.())
      const pressed = findPressable(tree, label)
      expect(pressed.findAllByType(View).filter((node) => node.props.testID === 'day-press-fill')).toHaveLength(2)
      const fill = pressed.findAllByProps({ testID: 'day-press-fill' })[0]
      expect(fill).toBeDefined()
      expect(StyleSheet.flatten(fill!.props.style as StyleProp<ViewStyle>)).toMatchObject({
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 22, backgroundColor: tokens.bgHover,
      })
      expect(discFill(pressed)).toBe(tokens.fg1)

      renderer.act(() => control.props.onPressOut?.())
      expect(findPressable(tree, label).findAllByProps({ testID: 'day-press-fill' })).toHaveLength(0)
    })
  })

  it('gives a read-only completed day no press fill', () => {
    withTree(<DayCell {...readOnlyFullDay} />, (tree) => {
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
      expect(tree.root.findAllByProps({ testID: 'day-press-fill' })).toHaveLength(0)
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
      expect(pressedFill(control, true)).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgHover })
      expect(pressedFill(control, false).backgroundColor).toBe('transparent')
    })
  })

  it.each([false, true])('fills the review dismiss target without losing its pending state: %s', (dismissPending) => {
    const event = { id: 'e1', title: 'Weekly review', description: null, startDate: null, startTime: null, endTime: null, startUtc: null, recurrenceTimeZone: null, isRecurring: false, recurrenceRule: null, reminders: [] }
    withTree(<CalendarSyncEventRow event={event} weekStartDay={1} selected={false} isReviewMode suggestionId="suggestion-1" dismissPending={dismissPending} styles={createCalendarSyncStyles()} tokens={tokens} t={((key: string) => key) as never} onToggle={() => {}} onDismiss={() => {}} />, (tree) => {
      const control = findPressable(tree, 'calendar.autoSync.dismissSuggestion')
      expect(control.props.hitSlop).toBeUndefined()
      expect(pressedFill(control, true)).toMatchObject({ width: 48, height: 48, backgroundColor: tokens.bgHover, borderRadius: 999, ...(dismissPending ? { opacity: 0.6 } : {}) })
      expect(pressedFill(control, false).backgroundColor).toBe('transparent')
    })
  })

  it('layers the neutral press fill over the whole opaque streak target', () => {
    withTree(<StreakBadge streak={3} />, (tree) => {
      const control = tree.root.findAllByType(Pressable)[0]!
      expect(control.props.hitSlop).toBeUndefined()
      expect(pressedFill(control, true)).toMatchObject({ minWidth: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden', backgroundColor: tokens.bgElev })
      expect(pressedFill(control, false).backgroundColor).toBe(tokens.bgElev)
      expect(pressedFill(control, true).borderWidth ?? 0).toBe(0)
    })
  })

  it('keeps an unimportable calendar row on its elevated fill until pressed', () => {
    const event = { id: 'e2', title: 'Second Monday review', description: null, startDate: '2026-09-14', startTime: null, endTime: null, startUtc: null, recurrenceTimeZone: null, isRecurring: true, recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=2MO', reminders: [] }
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
      expect(control.props).toMatchObject({ accessibilityState: { disabled: true }, accessibilityHint: 'calendar.importIssue.ordinalWeekday' })
      expect(pressedFill(control, false)).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgElev })
      expect(pressedFill(control, true).backgroundColor).toBe(tokens.bgHover)
    })
  })
})
