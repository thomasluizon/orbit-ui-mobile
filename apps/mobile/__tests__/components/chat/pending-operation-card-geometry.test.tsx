import { makeCreateHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import Yoga from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { makeHeldHabitMessage, habitListCardFixture } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { HabitListCard } from '@/components/chat/habit-list-card'
import { Button } from '@/components/ui/pill-button'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { renderedText } from '../../support/react-test-renderer'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({ TrueSheet: class extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
  present = vi.fn().mockResolvedValue(undefined)
  dismiss = vi.fn().mockResolvedValue(undefined)
  render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
} }))

const locales = ['en', 'pt-BR'] as const
const deletionSubjects = [{ subject: 'habits', capabilityId: 'habits.bulk.delete', actionKey: 'deleteHabits' }, { subject: 'goals', capabilityId: 'goals.delete', actionKey: 'deleteGoal' }, { subject: 'tags', capabilityId: 'tags.delete', actionKey: 'deleteTag' }, { subject: 'alerts', capabilityId: 'notifications.delete', actionKey: 'deleteNotifications' }, { subject: 'memories', capabilityId: 'user-facts.delete', actionKey: 'deleteUserFacts' }, { subject: 'templates', capabilityId: 'checklist-templates.write', actionKey: 'deleteChecklistTemplate' }]
const countedActions = ['createHabits', 'rescheduleHabits', 'updateHabitEmojis', 'setCalendarSync', 'dismissCalendarImport', 'markAllNotificationsRead']
const originalOperation = makeHeldHabitMessage().pendingOperations![0]!
const originalItem = originalOperation.items![0]!
const fields = [...originalItem.fields, { ...originalItem.fields[0]!, field: 'frequency_unit', newValue: 'Day' }, { ...originalItem.fields[0]!, field: 'frequency_quantity', newValue: '1', valueType: 'number' }]
const operation = { ...originalOperation, changes: fields, items: [{ ...originalItem, fields }] }
const handlers = { onRevise: vi.fn(), onRefresh: vi.fn(), onConfirmExecute: vi.fn(), onPrepareStepUp: vi.fn(), onVerifyStepUp: vi.fn() }

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function textWidth(label: string, size: number): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100"><text x="0" y="40" font-family="Geist" font-size="${size}">${label}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')], loadSystemFonts: false } }).getBBox()
  if (!bounds) throw new Error(`No glyph bounds for ${label}`)
  return Math.ceil(bounds.x + bounds.width + 8)
}

afterEach(async () => { __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }); await i18n.changeLanguage('en'); vi.clearAllMocks() })

describe('Pending preview geometry on Android', () => {
  it.each([1352, 1100, 412, 320].flatMap((width) => locales.flatMap((locale) => [undefined, ...countedActions].map((counted) => ({ width, locale, counted })))))('keeps controls readable at $width in $locale with counted action $counted', async ({ width, locale, counted }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    await i18n.changeLanguage(locale)
    const tree = render(<PendingOperationCard pendingOperation={counted ? { ...makeCreateHabitsPreview(), actionKey: counted } : operation} {...handlers} />)
    const row = tree.root.findByProps({ testID: 'preview-actions' })
    const buttons = row.findAllByType(Button)
    const labels = buttons.map((button: { props: { children: string } }) => button.props.children)
    expect(labels).toEqual([counted ? i18n.t(['createHabits', 'rescheduleHabits', 'updateHabitEmojis'].includes(counted) ? `chat.operation.approveCount.${counted}` : `chat.operation.approveAction.${counted}`, { count: 12 }) : i18n.t('chat.operation.approve'), i18n.t('chat.operation.edit'), i18n.t('chat.operation.reject')])
    expect(buttons[0].props.variant).toBe(width >= 1024 ? 'secondary' : 'primary')
    if (!counted) expect(renderedText(tree.toJSON())).toContain(i18n.t('habits.frequency.everyDay'))
    expect(renderedText(tree.toJSON())).not.toContain('frequency_unit')
    expect(tree.root.findAllByType(Text).filter((node: { props: { children?: unknown; importantForAccessibility?: string } }) => node.props.children === (counted ? 'Habit 1' : 'Beber água') && node.props.importantForAccessibility !== 'no-hide-descendants')).toHaveLength(1)
    const rowStyle = StyleSheet.flatten(row.props.style)
    const frame = tree.root.findByProps({ testID: 'block-frame-resting' })
    const frameStyle = StyleSheet.flatten(frame.props.style)
    const panelWidth = width >= 1024 ? 380 : width
    const rowWidth = panelWidth - 32 - frameStyle.padding * 2
    const layout = Yoga.Node.create()
    try {
      layout.setFlexDirection(rowStyle.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN)
      layout.setFlexWrap(rowStyle.flexWrap === 'wrap' ? Yoga.WRAP_WRAP : Yoga.WRAP_NO_WRAP)
      layout.setGap(Yoga.GUTTER_ALL, rowStyle.gap)
      buttons.forEach((button: { findByType: (type: unknown) => { props: { style: (state: { pressed: boolean }) => StyleProp<ViewStyle> } }; findAllByType: (type: unknown) => { props: { style: StyleProp<TextStyle>; children: string } }[] }, index: number) => {
        if (index === 2) {
          const spacer = Yoga.Node.create()
          const spacerView = row.findAllByType(View).find((node: { props: { style: StyleProp<ViewStyle> } }) => StyleSheet.flatten(node.props.style).flex === 1)
          spacer.setFlexGrow(StyleSheet.flatten(spacerView.props.style).flex)
          layout.insertChild(spacer, layout.getChildCount())
        }
        const style = StyleSheet.flatten(button.findByType(Pressable).props.style({ pressed: false }))
        const label = button.findAllByType(Text)[0]!
        const labelStyle = StyleSheet.flatten(label.props.style)
        const action = Yoga.Node.create()
        action.setWidth(textWidth(label.props.children, Number(labelStyle.fontSize)) + Number(style.paddingHorizontal) * 2)
        action.setHeight(Number(style.height))
        layout.insertChild(action, layout.getChildCount())
      })
      layout.calculateLayout(rowWidth, 'auto', Yoga.DIRECTION_LTR)
      const bounds = Array.from({ length: layout.getChildCount() }, (_, index) => layout.getChild(index).getComputedLayout())
      if (!counted && width >= 360) expect(new Set(bounds.map((bound) => bound.top)).size).toBe(1)
      for (const bound of bounds) expect(bound.left + bound.width).toBeLessThanOrEqual(rowWidth)
    } finally { layout.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
  })

  it.each(locales.flatMap((locale) => deletionSubjects.flatMap((target) => [1, 12, 120].map((count) => ({ locale, ...target, count })))))('keeps the $subject deletion heading on one line for $count in $locale at 320', async ({ locale, capabilityId, actionKey, count }) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 1 })
    await i18n.changeLanguage(locale)
    const tree = render(<PendingOperationCard pendingOperation={{ ...makeDeleteHabitsPreview(count), capabilityId, actionKey }} {...handlers} />)
    try {
      await TestRenderer.act(async () => { tree.root.findAllByType(Button).find((button: { props: { variant: string } }) => button.props.variant === 'primary').props.onClick(); await Promise.resolve() })
      const title = tree.root.findAllByType(Text).find((node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'header')
      const titleStyle = StyleSheet.flatten(title.props.style)
      const headerStyle = StyleSheet.flatten(title.parent.props.style)
      const close = tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === i18n.t('common.close'))
      const closeStyle = StyleSheet.flatten(typeof close.props.style === 'function' ? close.props.style({ pressed: false }) : close.props.style)
      const available = 320 - headerStyle.paddingHorizontal * 2 - headerStyle.gap - closeStyle.width
      expect(title.props.children).not.toMatch(/\d/)
      expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => typeof node.props.children === 'string' && node.props.children.startsWith(`${count} `))).toBe(true)
      expect(textWidth(title.props.children, Number(titleStyle.fontSize))).toBeLessThanOrEqual(available)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each(locales.flatMap((locale) => [1, 3].map((count) => ({ locale, count }))))('collapses $count rejected items in $locale', async ({ locale, count }) => {
    await i18n.changeLanguage(locale)
    const onRevise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true } })
    const pendingOperation = { ...operation, changeTargetCount: count, items: Array.from({ length: count }, (_, index) => ({ ...originalItem, itemId: `item-${index}`, entityName: `Habit ${index}` })) }
    const tree = render(<PendingOperationCard pendingOperation={pendingOperation} {...handlers} onRevise={onRevise} />)
    const reject = tree.root.findAllByType(Button).find((button: { props: { children?: unknown; importantForAccessibility?: string } }) => button.props.children === i18n.t('chat.operation.reject'))
    await TestRenderer.act(async () => { reject.props.onClick(); await Promise.resolve() })
    const expected = locale === 'en' ? count === 1 ? 'The change was rejected. Nothing was saved.' : 'The 3 changes were rejected. Nothing was saved.' : count === 1 ? 'A mudança foi rejeitada. Nada foi salvo.' : 'As 3 mudanças foram rejeitadas. Nada foi salvo.'
    expect(renderedText(tree.toJSON())).toContain(expected)
    expect(renderedText(tree.toJSON())).not.toContain('Habit 0')
    expect(tree.root.findAllByType(Button)).toHaveLength(0)
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it.each(locales)('keeps load more intrinsic and pages in place in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    const tree = render(<HabitListCard habitList={habitListCardFixture} />)
    const more = tree.root.findByType(Button)
    expect(more.props.children).toBe(i18n.t('chat.habitList.more'))
    expect(StyleSheet.flatten(more.parent.props.style).flexDirection).toBe('row')
    expect(renderedText(tree.toJSON())).not.toContain(habitListCardFixture.items[3]!.title)
    TestRenderer.act(() => more.props.onClick())
    expect(renderedText(tree.toJSON())).toContain(habitListCardFixture.items[3]!.title)
    expect(tree.root.findAllByType(Button)).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })
})
