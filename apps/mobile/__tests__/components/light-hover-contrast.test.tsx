import type { ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { neutralColors } from '@orbit/shared/theme'
import { HabitRow } from '@/components/habits/habit-row'
import { HabitLogButton } from '@/components/habits/habit-log-button'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { Menu } from '@/components/ui/menu'
import { SearchResult } from '@/components/search/search-results'

const themeMock = vi.hoisted((): { currentTheme: 'light' | 'dark' } => ({ currentTheme: 'light' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: themeMock.currentTheme }),
}))

const cases: { name: string; role: string; element: ReactElement }[] = [
  { name: 'checked row', role: 'checkbox', element: <CheckRow label="Checked" checked description="Description" value="Value" onChange={vi.fn()} /> },
  { name: 'row error', role: 'checkbox', element: <CheckRow label="Checked" checked error="Error" onChange={vi.fn()} /> },
  { name: 'personal row error', role: 'button', element: <CheckRow label="Personal" textMode="personal" onOpenLabel={vi.fn()} checked error="Error" value="Value" onChange={vi.fn()} /> },
  { name: 'list row', role: 'button', element: <ListRow title="Delete" danger description="Description" value="Value" onClick={vi.fn()} /> },
  { name: 'settings row', role: 'button', element: <SettingsRow label="Delete" danger desc="Description" value="Value" onPress={vi.fn()} /> },
  { name: 'settings group row', role: 'button', element: <SettingsGroupRow label="Preferences" hint="Value" onPress={vi.fn()} /> },
  { name: 'settings group value', role: 'button', element: <SettingsGroup items={[{ label: 'Preferences', value: 'Value', onClick: vi.fn() }]} /> },
  { name: 'search match', role: 'button', element: <SearchResult habit={createMockHabit({ title: 'Walking', emoji: '' })} query="Walk" onOpen={vi.fn()} /> },
  { name: 'menu edit', role: 'menuitem', element: <Menu open presentation="sheet" items={[{ id: 'edit', label: 'Edit' }]} /> },
  { name: 'menu delete', role: 'menuitem', element: <Menu open presentation="sheet" items={[{ id: 'delete', label: 'Delete', destructive: true }]} /> },
]

function pressedFill(control: ReactTestInstance): string {
  const style = control.props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  const resolved = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: true }) : style)
  return resolved.backgroundColor as string
}

describe('light hover text on Android', () => {
  it.each([
    { name: 'empty habit', element: <HabitLogButton label="Log habit" logged={false} onPress={() => {}} /> },
    { name: 'habit progress', element: <HabitLogButton label="Log habit" logged={false} progress={0} onPress={() => {}} /> },
    { name: 'partial day', element: <DayCell day={16} done={1} scheduled={2} words={{ none: 'Empty', partial: 'Partial', full: 'Done', notScheduled: 'Not scheduled', of: 'of', today: 'Today', readOnly: 'Read only' }} loggable onPress={() => {}} /> },
  ])('keeps the $name track neutral at rest and on press', async ({ element }) => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(element) })
    const trackColor = () => {
      const circle = tree.root.findAll((node) => String(node.type) === 'Circle')[0]
      const ring = tree.root.findAll((node) => node.props.testID === 'status-ring')[0]
      return circle ? String(circle.props.stroke) : String(StyleSheet.flatten(ring!.props.style as StyleProp<ViewStyle>).borderColor)
    }
    try {
      const resting = trackColor()
      expect(resting).toBe(neutralColors.light.trackEmpty)
      const control = tree.root.findAll((node) => String(node.type) === 'Pressable')[0]!
      await act(() => { (control.props.onPressIn as (() => void) | undefined)?.() })
      expect(trackColor()).toBe(resting)
      for (const surface of [neutralColors.light.bg, neutralColors.light.bgCard]) {
        expect(contrastOnSurface(trackColor(), [surface])).toBeGreaterThanOrEqual(3)
        expect(contrastOnSurface(trackColor(), [surface, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(3)
      }
      await act(() => { (control.props.onPressOut as (() => void) | undefined)?.() })
      expect(trackColor()).toBe(resting)
    } finally { await act(() => { tree.update(<></>) }) }
  })

  it.each(cases)('keeps every text on $name above the floor', async ({ element, role }) => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(element) })
    try {
      let control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === role)[0]!
      expect(control).toBeDefined()
      const restingColors = control.findAll((node) => String(node.type) === 'Text')
        .map((label) => StyleSheet.flatten(label.props.style as StyleProp<TextStyle>).color)
      await act(() => { (control.props.onPressIn as (() => void) | undefined)?.() })
      control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === role)[0]!
      const pressedColors = control.findAll((node) => String(node.type) === 'Text')
        .map((label) => StyleSheet.flatten(label.props.style as StyleProp<TextStyle>).color)
      expect(pressedColors).toEqual(restingColors.map((color) => color === neutralColors.light.fg3 ? neutralColors.light.fg2 : color))
      const fill = pressedFill(control)
      expect(fill).toBe(neutralColors.light.bgHover)
      for (const surface of [neutralColors.light.bg, neutralColors.light.bgElev]) {
        expect(contrastOnSurface(surface, [surface, fill])).toBeGreaterThanOrEqual(1.25)
        const text = control.findAll((node) => String(node.type) === 'Text')
        expect(text.length).toBeGreaterThan(0)
        for (const label of text) {
          const color = StyleSheet.flatten(label.props.style as StyleProp<TextStyle>).color as string
          expect(contrastOnSurface(color, [surface, fill])).toBeGreaterThanOrEqual(4.5)
        }
      }
      await act(() => { (control.props.onPressOut as (() => void) | undefined)?.() })
    } finally {
      await act(() => { tree.update(<></>) })
    }
  })
})

describe('habit monogram contrast on Android', () => {
  it.each((['light', 'dark'] as const).flatMap((mode) =>
    ([0, 1] as const).map((depth) => ({ mode, depth })),
  ))('keeps the monogram readable at rest and on press in $mode, depth=$depth', async ({ mode, depth }) => {
    themeMock.currentTheme = mode
    const colors = neutralColors[mode]
    let tree!: ReactTestRenderer
    await act(() => {
      tree = create(<View style={{ backgroundColor: colors.bg }}>
        <HabitRow habit={createMockHabit({ title: 'Walking', emoji: '' })} depth={depth} />
      </View>)
    })
    const body = () => tree.root.findAll((node) => String(node.type) === 'Pressable' && typeof node.props.onPressIn === 'function')[0]!
    const measure = () => {
      const monogram = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'W')[0]!
      const canvas = tree.root.findAll((node) => String(node.type) === 'View')[0]!
      const card = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'habit-row')[0]!
      const well = tree.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityElementsHidden === true)[0]!
      return {
        color: StyleSheet.flatten(monogram.props.style as StyleProp<TextStyle>).color as string,
        well: StyleSheet.flatten(well.props.style as StyleProp<ViewStyle>).backgroundColor as string,
        canvas: StyleSheet.flatten(canvas.props.style as StyleProp<ViewStyle>).backgroundColor as string,
        card: StyleSheet.flatten(card.props.style as StyleProp<ViewStyle>).backgroundColor as string,
      }
    }
    try {
      const resting = measure()
      expect(contrastOnSurface(resting.color, [resting.canvas, resting.card, resting.well])).toBeGreaterThanOrEqual(4.5)
      await act(() => { (body().props.onPressIn as () => void)() })
      const pressed = measure()
      const fill = pressedFill(body())
      expect(contrastOnSurface(pressed.color, [pressed.canvas, pressed.card, fill, pressed.well])).toBeGreaterThanOrEqual(4.5)
      expect(pressed.color).toBe(colors.fg2)
      await act(() => { (body().props.onPressOut as () => void)() })
      expect(measure()).toEqual(resting)
    } finally {
      await act(() => { tree.update(<></>) })
      themeMock.currentTheme = 'light'
    }
  })
})
