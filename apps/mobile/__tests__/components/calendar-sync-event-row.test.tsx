import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarSyncEvent } from '@orbit/shared'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
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
    importantForAccessibility?: string
    children?: unknown
    style?: StyleProp<TextStyle & ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
    accessibilityRole?: string
    accessibilityState?: { checked: boolean; disabled: boolean }
    accessibilityHint?: string
    disabled?: boolean
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
        event={blocked ? { ...event, recurrenceRule: 'RRULE:FREQ=MONTHLY;COUNT=3', startDate: '2026-01-31', startTime: null } : event}
        weekStartDay={1} selected={selected} isReviewMode suggestionId="suggestion"
        dismissPending={false} styles={createStyles()} tokens={tokens}
        t={((key: string) => key) as TFunction} onToggle={onToggle} onDismiss={onDismiss}
      />) as unknown as RowTree
      trees.push(tree)
    })
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox')[0]!
    expect(row.props.disabled).toBe(blocked)
    expect(row.props.accessibilityState).toEqual({ checked: selected, disabled: blocked })
    if (blocked) expect(row.props.accessibilityHint).toBe('calendar.importIssue.finiteDateClamp')
    const rowStyle = row.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
    for (const pressed of blocked ? [false] : [false, true]) {
      const fill = String(StyleSheet.flatten(rowStyle({ pressed })).backgroundColor)
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
