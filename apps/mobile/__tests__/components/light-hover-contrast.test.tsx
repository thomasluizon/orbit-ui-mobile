import type { ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { neutralColors } from '@orbit/shared/theme'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { Menu } from '@/components/ui/menu'
import { SearchResult } from '@/components/search/search-results'

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'light' }),
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
  it.each(cases)('keeps every text on $name above the floor', async ({ element, role }) => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(element) })
    try {
      let control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === role)[0]!
      expect(control).toBeDefined()
      await act(() => { (control.props.onPressIn as (() => void) | undefined)?.() })
      control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === role)[0]!
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
