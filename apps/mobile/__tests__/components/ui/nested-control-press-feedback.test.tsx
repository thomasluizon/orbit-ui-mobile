import type { ReactElement } from 'react'
import { Pressable, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import type { TFunction } from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarSyncEvent } from '@orbit/shared'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { ListRow } from '@/components/ui/list-row'
import { NotificationRow } from '@/components/navigation/notification-row'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { HabitBlockRow } from '@/components/chat/habit-block-row'
import { PickerRow } from '@/components/ui/picker-row'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))

const tokens = createTokensV2('orange', 'dark')

interface FeedbackNode {
  type: unknown
  props: {
    testID?: string
    accessibilityLabel?: string
    accessibilityRole?: string
    style?: StyleProp<TextStyle>
    'data-slot'?: string
    onPressIn?: () => void
    onPressOut?: () => void
    onHoverIn?: () => void
    onHoverOut?: () => void
    onFocus?: () => void
    onBlur?: () => void
    onTouchStart?: () => void
    onTouchEnd?: () => void
    onTouchCancel?: () => void
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    children?: unknown
  }
}

interface FeedbackTree {
  root: { findAll: (predicate: (node: FeedbackNode) => boolean) => FeedbackNode[] }
  unmount: () => void
}

const trees: FeedbackTree[] = []
afterEach(() => { void act(() => { trees.splice(0).forEach((tree) => tree.unmount()) }) })

function mount(element: ReactElement) {
  let tree!: FeedbackTree
  void act(() => { tree = create(element) })
  trees.push(tree)
  return tree
}

function trigger(node: FeedbackNode, handler: 'onPressIn' | 'onPressOut' | 'onHoverIn' | 'onHoverOut' | 'onFocus' | 'onBlur') {
  void act(() => { node.props[handler]?.() })
}

function background(node: FeedbackNode) {
  return StyleSheet.flatten(node.props.style).backgroundColor
}

function pressable(tree: FeedbackTree, label: string) {
  const matches = tree.root.findAll((node) => (typeof node.type === 'function' || node.type === 'Pressable') && node.props.accessibilityLabel === label)
  return matches.find((node) => typeof node.type === 'function') ?? matches[0]!
}

interface Surface {
  name: string
  render: () => FeedbackTree
  parentFill: (tree: FeedbackTree) => FeedbackNode
  body: (tree: FeedbackTree) => FeedbackNode
  nested: (tree: FeedbackTree) => FeedbackNode[]
  ownFill?: (tree: FeedbackTree) => FeedbackNode
}

const notification = createMockNotification({ id: 'nested', title: 'Reminder', isRead: false })
const event: CalendarSyncEvent = {
  id: 'event', title: 'Weekly planning', calendarName: 'Work calendar',
  description: 'Review every step.', startDate: '2026-07-01', startTime: '09:00', endTime: '10:00',
  isRecurring: false, recurrenceRule: null, reminders: [],
}

const surfaces: Surface[] = [
  {
    name: 'Avisos notification row',
    render: () => mount(<NotificationRow item={notification} onOpen={vi.fn()} onDelete={vi.fn()} />),
    parentFill: (tree) => tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'notification-row-feedback')[0]!,
    body: (tree) => tree.root.findAll((node) => node.type === 'Pressable')[0]!,
    nested: (tree) => [pressable(tree, 'notifications.deleteNotification')],
    ownFill: (tree) => tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'notification-delete-feedback')[0]!,
  },
  {
    name: 'list row with a trailing action',
    render: () => mount(<ListRow title="Morning run" onClick={vi.fn()} action={{ icon: 'trash', label: 'Remove row', onPress: vi.fn() }} />),
    parentFill: (tree) => tree.root.findAll((node) => node.type === 'View' && node.props['data-slot'] === 'list-row-fill')[0]!,
    body: (tree) => tree.root.findAll((node) => node.type === 'Pressable')[0]!,
    nested: (tree) => [pressable(tree, 'Remove row')],
  },
  {
    name: 'calendar import event row',
    render: () => mount(<CalendarSyncEventRow event={event} weekStartDay={1} selected={false} isReviewMode suggestionId="suggestion"
      dismissPending={false} styles={createStyles()} tokens={tokens} t={((key: string) => key) as TFunction} onToggle={vi.fn()} onDismiss={vi.fn()} />),
    parentFill: (tree) => tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-event-feedback')[0]!,
    body: (tree) => tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox')[0]!,
    nested: (tree) => tree.root.findAll((node) => node.type === MotionPressable && node.props.accessibilityRole === 'button' && typeof node.props.onPressIn === 'function'),
  },
]

function slotEvent(node: FeedbackNode, handler: 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel' | 'onPointerEnter' | 'onPointerLeave') {
  void act(() => { node.props[handler]?.() })
}

function textColor(tree: FeedbackTree, text: string) {
  const node = tree.root.findAll((candidate) => candidate.type === 'Text' && candidate.props.children === text)[0]!
  return StyleSheet.flatten(node.props.style).color
}

const slotSurfaces = [
  {
    name: 'proposed Astra habit block row',
    title: 'Walk after breakfast',
    fillTestID: 'habit-block-feedback',
    slotTestID: 'habit-block-control',
    render: () => mount(<HabitBlockRow proposed title="Walk after breakfast" onOpen={vi.fn()}
      control={<Pressable accessibilityRole="checkbox" accessibilityLabel="Choose walk" onPress={vi.fn()} />} />),
  },
  {
    name: 'proposed picker row',
    title: 'Morning',
    fillTestID: 'picker-row-feedback',
    slotTestID: 'picker-row-controls',
    render: () => mount(<PickerRow proposed name="Morning" selected={false} disabled={false} onToggle={vi.fn()} value="" valueHidden valueStyle={{ color: tokens.fg2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit tag: Morning" onPress={vi.fn()} /></PickerRow>),
  },
]

describe('one active fill for a nested control on Android', () => {
  it.each(surfaces)('keeps the $name fill at rest while a nested control is pressed or hovered', (surface) => {
    const tree = surface.render()
    const nested = surface.nested(tree)
    expect(nested.length).toBeGreaterThan(0)
    expect(background(surface.parentFill(tree))).toBe('transparent')
    for (const control of nested) {
      const ownFill = () => background(surface.ownFill ? surface.ownFill(tree) : surface.nested(tree).find((node) => node.props.accessibilityLabel === control.props.accessibilityLabel)!)
      trigger(control, 'onPressIn')
      expect(background(surface.parentFill(tree)), `${surface.name}: pressed ${control.props.accessibilityLabel}`).toBe('transparent')
      expect(ownFill(), `${surface.name}: own press fill of ${control.props.accessibilityLabel}`).toBe(tokens.bgHover)
      trigger(control, 'onPressOut')
      trigger(control, 'onHoverIn')
      expect(background(surface.parentFill(tree)), `${surface.name}: hovered ${control.props.accessibilityLabel}`).toBe('transparent')
      expect(ownFill(), `${surface.name}: own hover fill of ${control.props.accessibilityLabel}`).toBe(tokens.bgHover)
      trigger(control, 'onHoverOut')
      trigger(control, 'onFocus')
      expect(background(surface.parentFill(tree)), `${surface.name}: focused ${control.props.accessibilityLabel}`).toBe(tokens.bgHover)
      expect(ownFill(), `${surface.name}: own focus fill of ${control.props.accessibilityLabel}`).toBe(tokens.bgRowAction)
      trigger(control, 'onBlur')
    }
  })

  it.each(surfaces)('paints the $name fill again when the pointer moves from a nested control to the body', (surface) => {
    const tree = surface.render()
    const [control] = surface.nested(tree)
    trigger(control!, 'onHoverIn')
    expect(background(surface.parentFill(tree))).toBe('transparent')
    trigger(control!, 'onHoverOut')
    trigger(surface.body(tree), 'onHoverIn')
    expect(background(surface.parentFill(tree))).toBe(tokens.bgHover)
    trigger(surface.body(tree), 'onHoverOut')
    trigger(surface.body(tree), 'onPressIn')
    expect(background(surface.parentFill(tree))).toBe(tokens.bgHover)
  })

  it.each(slotSurfaces)('rests the $name fill and text while a nested control is pressed or hovered over the keyboard-focused body', (surface) => {
    const tree = surface.render()
    const fill = () => background(tree.root.findAll((node) => node.type === 'View' && node.props.testID === surface.fillTestID)[0]!)
    const slot = () => tree.root.findAll((node) => node.type === 'View' && node.props.testID === surface.slotTestID)[0]!
    expect(fill()).toBe('transparent')
    expect(textColor(tree, surface.title)).toBe(tokens.fg3)
    trigger(pressable(tree, surface.title), 'onFocus')
    expect(fill(), `${surface.name}: keyboard focus on the body`).toBe(tokens.bgHover)
    expect(textColor(tree, surface.title)).toBe(tokens.fg2)
    for (const [start, end] of [['onTouchStart', 'onTouchEnd'], ['onTouchStart', 'onTouchCancel'], ['onPointerEnter', 'onPointerLeave']] as const) {
      slotEvent(slot(), start)
      expect(fill(), `${surface.name}: ${start} on a nested control over the focused body`).toBe('transparent')
      expect(textColor(tree, surface.title), `${surface.name}: proposed title under ${start}`).toBe(tokens.fg3)
      slotEvent(slot(), end)
      expect(fill(), `${surface.name}: ${end} returns the focused body fill`).toBe(tokens.bgHover)
      expect(textColor(tree, surface.title)).toBe(tokens.fg2)
    }
  })

  it('keeps the notification row lit for keyboard focus on delete', () => {
    const tree = surfaces[0]!.render()
    const [remove] = surfaces[0]!.nested(tree)
    trigger(remove!, 'onFocus')
    expect(background(surfaces[0]!.parentFill(tree))).toBe(tokens.bgHover)
    trigger(remove!, 'onBlur')
    expect(background(surfaces[0]!.parentFill(tree))).toBe('transparent')
  })
})
