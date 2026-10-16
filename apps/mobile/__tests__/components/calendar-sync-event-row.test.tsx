import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarSyncEvent } from '@orbit/shared'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
import { RadioGlyph } from '@/components/ui/select-check'
import { PersonalText } from '@/components/ui/personal-text'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'

const theme = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({
  currentScheme: 'orange', currentTheme: 'dark',
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))

const event: CalendarSyncEvent = {
  id: 'event', title: 'Weekly planning', calendarName: 'Work calendar',
  description: 'Review every preparation step before importing.',
  startDate: '2026-07-01', startTime: '09:00', endTime: '10:00',
  isRecurring: true, recurrenceRule: 'RRULE:FREQ=DAILY', reminders: [10],
}

interface RowNode {
  type: unknown
  parent: RowNode | null
  props: {
    pointerEvents?: string
    importantForAccessibility?: string
    children?: unknown
    style?: StyleProp<TextStyle & ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
    accessibilityRole?: string
    accessibilityState?: { checked: boolean; disabled: boolean }
    accessibilityLabel?: string
    expanded?: boolean
    accessibilityHint?: string
    disabled?: boolean
    onPressIn?: () => void
    onPressOut?: () => void
    testID?: string
    onPress?: () => void
  }
}

interface RowTree {
  root: { findAll: (predicate: (node: RowNode) => boolean) => RowNode[] }
  unmount: () => void
}

const trees: RowTree[] = []
afterEach(() => { void act(() => { trees.splice(0).forEach((tree) => tree.unmount()) }) })

function textLayers(text: RowNode, row: RowNode) {
  const layers: string[] = []
  for (let surface: RowNode | null = text; surface && surface !== row; surface = surface.parent) {
    if (typeof surface.type !== 'string' || !surface.props.style || typeof surface.props.style === 'function') continue
    const background = StyleSheet.flatten(surface.props.style).backgroundColor
    if (background) layers.unshift(String(background))
  }
  return layers
}

function expectTextContrast(tree: RowTree, row: RowNode, layers: string[], state: string) {
  const texts = tree.root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
  expect(texts.length).toBeGreaterThanOrEqual(6)
  for (const text of texts) {
    const color = String(StyleSheet.flatten(text.props.style as StyleProp<TextStyle>).color)
    const backgrounds = [...layers, ...textLayers(text, row)].filter((layer) => layer !== 'transparent')
    expect(contrastOnSurface(color, backgrounds), `${state}, ${String(text.props.children)}`).toBeGreaterThanOrEqual(4.5)
  }
}

describe('calendar import row press contrast', () => {
  it.each((['dark', 'light'] as const).flatMap((mode) =>
    ['plain', 'selected', 'blocked'].map((state) => ({ mode, state })),
  ))('keeps the $state row rounded without a separator in $mode', ({ mode, state }) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    const blocked = state === 'blocked'
    let tree!: RowTree
    void act(() => {
      tree = create(<CalendarSyncEventRow
        event={blocked ? { ...event, recurrenceRule: 'RRULE:FREQ=DAILY;UNTIL=20260701T043000Z', startDate: '2026-01-01', startTime: '00:30', startUtc: '2026-01-01T05:30:00Z', recurrenceTimeZone: null } : event}
        weekStartDay={1} selected={state === 'selected'} isReviewMode={false} suggestionId={null}
        dismissPending={false} styles={createStyles()} tokens={tokens}
        t={((key: string) => key) as TFunction} onToggle={vi.fn()} onDismiss={vi.fn()}
      />) as unknown as RowTree
      trees.push(tree)
    })
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox')[0]!
    expect(row.props.disabled).toBe(blocked)
    expect(row.props.accessibilityState).toEqual({ checked: state === 'selected', disabled: blocked })
    if (blocked) expect(row.props.accessibilityHint).toBe('calendar.importIssue.utcUntilOffsetShift')
    for (const pressed of blocked ? [false] : [false, true]) {
      const flattened = StyleSheet.flatten(row.props.style as StyleProp<ViewStyle>)
      expect(flattened).not.toHaveProperty('borderBottomWidth')
      expect(flattened).not.toHaveProperty('borderBottomColor')
      expect(flattened.borderRadius).toBe(12)
      expect(flattened.overflow).toBeUndefined()
      void act(() => { (pressed ? row.props.onPressIn : row.props.onPressOut)?.() })
      const fill = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-event-fill')[0]!
      const paint = StyleSheet.flatten(fill.props.style as StyleProp<ViewStyle>)
      expect(paint).toMatchObject({ borderRadius: 12, overflow: 'hidden' })
      expect(paint.left).toBe(-16)
      expect(paint.right).toBe(-16)
      expect(paint.backgroundColor).toBe(pressed && !blocked ? tokens.bgHover : blocked ? tokens.bgElev : state === 'selected' ? tintFromPrimary(tokens, 0.06) : 'transparent')
    }
  })

  it('expands the existing event title without duplicating it or exposing the description', () => {
    let tree!: RowTree
    void act(() => {
      tree = create(<CalendarSyncEventRow event={event} weekStartDay={1} selected isReviewMode={false} suggestionId={null} dismissPending={false} styles={createStyles()} tokens={createTokensV2('orange', 'dark')} t={((key: string) => key) as TFunction} onToggle={vi.fn()} onDismiss={vi.fn()} />) as unknown as RowTree
      trees.push(tree)
    })
    const disclosure = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'contextMenu.viewDetails')[0]!
    const titles = () => tree.root.findAll((node) => node.type === PersonalText && node.props.children === event.title)
    expect(titles()).toHaveLength(1)
    expect(titles()[0]!.props.expanded).toBe(false)
    void act(() => { disclosure.props.onPress!() })
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: true })
    expect(titles()).toHaveLength(1)
    expect(titles()[0]!.props.expanded).toBe(true)
    const scrollers = tree.root.findAll((node) => node.type === 'ScrollView')
    expect(scrollers).toHaveLength(2)
    const staticContent = tree.root.findAll((node) => {
      if (node.type === RadioGlyph) return true
      if (node.type !== 'Text') return false
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.type === PersonalText) return false
      }
      return true
    })
    expect(staticContent.length).toBeGreaterThanOrEqual(4)
    for (const content of staticContent) {
      let pointerTransparent = false
      for (let ancestor = content.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.props.pointerEvents === 'none') pointerTransparent = true
      }
      expect(pointerTransparent).toBe(true)
    }
    for (const scroller of scrollers) {
      for (let ancestor = scroller.parent; ancestor; ancestor = ancestor.parent) {
        expect(ancestor.type).not.toBe('Pressable')
      }
    }
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === event.description)).toHaveLength(0)
    void act(() => { disclosure.props.onPress!() })
    expect(titles()[0]!.props.expanded).toBe(false)
  })

  it.each((['dark', 'light'] as const).flatMap((mode) => [false, true].flatMap((selected) =>
    [false, true].map((blocked) => ({ mode, selected, blocked })),
  )))('keeps native text readable in $mode, selected: $selected, blocked: $blocked', ({ mode, selected, blocked }) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    const onToggle = vi.fn()
    const onDismiss = vi.fn()
    let tree!: RowTree
    void act(() => {
      tree = create(<CalendarSyncEventRow
        event={blocked ? { ...event, recurrenceRule: 'RRULE:FREQ=DAILY;UNTIL=20260701T043000Z', startDate: '2026-01-01', startTime: '00:30', startUtc: '2026-01-01T05:30:00Z', recurrenceTimeZone: null } : event}
        weekStartDay={1} selected={selected} isReviewMode suggestionId="suggestion"
        dismissPending={false} styles={createStyles()} tokens={tokens}
        t={((key: string) => key) as TFunction} onToggle={onToggle} onDismiss={onDismiss}
      />) as unknown as RowTree
      trees.push(tree)
    })
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox')[0]!
    expect(row.props.disabled).toBe(blocked)
    expect(row.props.accessibilityState).toEqual({ checked: selected, disabled: blocked })
    if (blocked) expect(row.props.accessibilityHint).toBe('calendar.importIssue.utcUntilOffsetShift')
    for (const pressed of blocked ? [false] : [false, true]) {
      void act(() => { (pressed ? row.props.onPressIn : row.props.onPressOut)?.() })
      const painted = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-event-fill')[0]!
      const fill = String(StyleSheet.flatten(painted.props.style as StyleProp<ViewStyle>).backgroundColor)
      expect(fill).toBe(pressed ? tokens.bgHover : blocked ? tokens.bgElev : selected ? tintFromPrimary(tokens, 0.06) : 'transparent')
      expectTextContrast(tree, row, [tokens.bgSheet, fill], `${mode}, selected: ${selected}, pressed: ${pressed}`)
    }
    if (!blocked) {
      void act(() => { row.props.onPress!() })
      expect(onToggle).toHaveBeenCalledWith(event.id)
    }
    const dismiss = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')[0]!
    void act(() => { dismiss.props.onPress!() })
    expect(onDismiss).toHaveBeenCalledWith('suggestion')
    expect(onToggle).toHaveBeenCalledTimes(blocked ? 0 : 1)
  })
})
