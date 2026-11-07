import type { ReactElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import type { TFunction } from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarSyncEvent } from '@orbit/shared'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { ListRow } from '@/components/ui/list-row'
import { NotificationRow } from '@/components/navigation/notification-row'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
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
    style?: StyleProp<ViewStyle>
    'data-slot'?: string
    onPressIn?: () => void
    onPressOut?: () => void
    onHoverIn?: () => void
    onHoverOut?: () => void
    onFocus?: () => void
    onBlur?: () => void
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
  return tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]!
}

interface Surface {
  name: string
  render: () => FeedbackTree
  parentFill: (tree: FeedbackTree) => FeedbackNode
  body: (tree: FeedbackTree) => FeedbackNode
  nested: (tree: FeedbackTree) => FeedbackNode[]
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
    nested: (tree) => tree.root.findAll((node) => (node.type === 'Pressable' || typeof node.type === 'function') && node.props.accessibilityRole === 'button' && typeof node.props.onPressIn === 'function'),
  },
]

describe('one active fill for a nested control on Android', () => {
  it.each(surfaces)('keeps the $name fill at rest while a nested control is pressed or hovered', (surface) => {
    const tree = surface.render()
    const nested = surface.nested(tree)
    expect(nested.length).toBeGreaterThan(0)
    expect(background(surface.parentFill(tree))).toBe('transparent')
    for (const control of nested) {
      trigger(control, 'onPressIn')
      expect(background(surface.parentFill(tree)), `${surface.name}: pressed ${control.props.accessibilityLabel}`).toBe('transparent')
      trigger(control, 'onPressOut')
      trigger(control, 'onHoverIn')
      expect(background(surface.parentFill(tree)), `${surface.name}: hovered ${control.props.accessibilityLabel}`).toBe('transparent')
      trigger(control, 'onHoverOut')
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

  it('keeps the notification row lit for keyboard focus on delete', () => {
    const tree = surfaces[0]!.render()
    const [remove] = surfaces[0]!.nested(tree)
    trigger(remove!, 'onFocus')
    expect(background(surfaces[0]!.parentFill(tree))).toBe(tokens.bgHover)
    trigger(remove!, 'onBlur')
    expect(background(surfaces[0]!.parentFill(tree))).toBe('transparent')
  })
})
