import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { StyleSheet, Text } from 'react-native'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { ProfilePreferencesContent } from '@/app/(tabs)/profile/_components/profile-preferences-content'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const TestRenderer = require('react-test-renderer')
const preferences = vi.hoisted(() => ({ locale: 'pt-BR', checked: false, open: vi.fn(), toggle: vi.fn() }))

vi.mock('@/app/use-preference-controls', () => ({ usePreferenceControls: () => ({
    selectedLanguage: preferences.locale, currentTheme: 'dark', currentScheme: 'purple',
    activePicker: null, setActivePicker: preferences.open, handleThemeModeChange: vi.fn(),
    showGeneralOnToday: preferences.checked, toggleShowGeneral: preferences.toggle,
    handleShowGeneralToggle: preferences.toggle, handleLanguageChange: vi.fn(),
    timeZoneMutation: { mutate: vi.fn() }, weekStartMutation: { mutate: vi.fn() }, clockFormatMutation: { mutate: vi.fn() },
  }) }))
vi.mock('@/components/profile/preferences-sections', () => ({ PreferencePickerSheet: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

afterEach(async () => { await i18n.changeLanguage('en') })

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => [1, 2].map((scale) => ({ locale, width, scale })))))('keeps Android preference labels whole in $locale at $width and scale $scale', async ({ locale, width, scale }) => {
  preferences.locale = locale
  await i18n.changeLanguage(locale)
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfilePreferencesContent profile={createMockProfile({ timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true })} patchProfile={vi.fn()} />) })
  try {
    const labels = tree.root.findAllByType(Text)
    const description = i18n.t('settings.homeScreen.showGeneralDesc')
    expect(labels).toHaveLength(13)
    for (const text of labels) expect(text.props.numberOfLines, text.props.children).toBeUndefined()
    const measured = measureProfileRow(tree.toJSON(), width - 32, scale)
    expect(measured.texts).toHaveLength(13)
    for (const text of measured.texts) {
      expect(text.clipped, text.label).toBe(false)
      expect(text.left, text.label).toBeGreaterThanOrEqual(0)
      expect(text.right, text.label).toBeLessThanOrEqual(width - 32)
      if (scale === 1 && text.label !== description) expect(text.lines, text.label).toBe(1)
    }
    const switchLabel = labels.find((text: { props: { children: string } }) => text.props.children === i18n.t('settings.homeScreen.showGeneral'))!
    let row = switchLabel.parent!
    while (row.type !== 'View' || StyleSheet.flatten(row.props.style)?.gap !== 4) row = row.parent!
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ gap: 4, minWidth: 0 })
    let container = row.parent!
    while (StyleSheet.flatten(typeof container.props.style === 'function' ? container.props.style({ pressed: false }) : container.props.style)?.paddingHorizontal !== 16) container = container.parent!
    expect(StyleSheet.flatten(typeof container.props.style === 'function' ? container.props.style({ pressed: false }) : container.props.style)).toMatchObject({ paddingHorizontal: 16, paddingVertical: 12 })
    const control = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')[0]!
    expect(control.props.accessibilityLabel).toBe(switchLabel.props.children)
    const controlStyle = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style
    expect(StyleSheet.flatten(controlStyle).minHeight).toBe(68)
  } finally { TestRenderer.act(() => tree.unmount()) }
})

it.each([false, true])('keeps the Android switch state %s and picker actions connected to their labels', async (checked) => {
  preferences.locale = 'pt-BR'
  preferences.checked = checked
  await i18n.changeLanguage('pt-BR')
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfilePreferencesContent profile={createMockProfile()} patchProfile={vi.fn()} />) })
  try {
    const buttons = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')
    expect(buttons).toHaveLength(4)
    for (const [index, picker] of ['timeZone', 'weekStart', 'clock', 'language'].entries()) {
      TestRenderer.act(() => buttons[index]!.props.onPress())
      expect(preferences.open).toHaveBeenLastCalledWith(picker)
    }
    const control = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')[0]!
    expect(control.props.accessibilityState).toMatchObject({ checked })
    TestRenderer.act(() => control.props.onPress())
    expect(preferences.toggle).toHaveBeenLastCalledWith(!checked)
  } finally { TestRenderer.act(() => tree.unmount()); preferences.checked = false }
})
