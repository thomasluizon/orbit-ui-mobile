import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { SelectionTray } from '@/components/habits/selection-tray'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'

const state = vi.hoisted((): { mode: 'dark' | 'light'; reducedMotion: boolean } => ({ mode: 'dark', reducedMotion: false }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: state.mode }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => state.reducedMotion }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const noop = () => {}

function selectionTray(allSelected: boolean, disabled: boolean, completionReadOnly = false) {
  return <SelectionTray count={disabled ? 0 : 2} allSelected={allSelected} completionReadOnly={completionReadOnly}
    onSelectAll={noop} onDeselectAll={noop} onLog={noop} onSkip={noop} onDelete={noop} onClose={noop}
    countSuffixLabel="selected" selectAllLabel="Select all" deselectAllLabel="Deselect all"
    logLabel="Log" skipLabel="Skip" deleteLabel="Delete" closeLabel="Close" />
}

function renderedTree(element: React.ReactElement) {
  let tree!: ReturnType<typeof renderer.create>
  void renderer.act(() => { tree = renderer.create(element) })
  return tree
}

function renderedButtons(element: React.ReactElement) {
  return renderedTree(element).root.findAll((node) => (node.type as unknown) === 'Pressable')
}

function resolvedStyle(button: import('react-test-renderer').ReactTestInstance, pressed: boolean) {
  const style = button.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
  return StyleSheet.flatten(style({ pressed }))
}

describe('neutral press feedback on Android', () => {
  it.each(['dark', 'light'] as const)('uses the neutral role and restores rest in %s with reduced motion', (mode) => {
    state.mode = mode
    state.reducedMotion = true
    const buttons = renderedButtons(<>
      {selectionTray(false, false)}
      {selectionTray(true, false)}
      <AstraAllowancePanel profile={createMockProfile()} onPlanAction={noop} />
      <PillButton variant="ghost">Ghost</PillButton>
      <PillButton variant="ghost" quiet>Quiet</PillButton>
    </>)
    expect(buttons).toHaveLength(13)
    for (const button of buttons) {
      const rest = resolvedStyle(button, false)
      expect(rest.backgroundColor ?? 'transparent').toBe('transparent')
      expect(rest.minHeight ?? rest.height).toBeGreaterThanOrEqual(44)
      expect(rest.minWidth ?? rest.width).toBeGreaterThanOrEqual(44)
      const pressed = resolvedStyle(button, true)
      expect(pressed.backgroundColor).toBe(createTokensV2('orange', mode).bgHover)
      expect(pressed.transform).toBeUndefined()
      expect(resolvedStyle(button, false)).toEqual(rest)
    }
  })

  it.each(['dark', 'light'] as const)('keeps select-all text legible on press and restores it in %s', (mode) => {
    state.mode = mode
    const tokens = createTokensV2('orange', mode)
    for (const allSelected of [false, true]) {
      const button = renderedTree(selectionTray(allSelected, false)).root.findAll((node) => typeof node.props.children === 'function' && typeof node.props.style === 'function')[0]!
      const child = button.props.children as (state: { pressed: boolean }) => ReactElement<{ style: StyleProp<TextStyle>; children: string }>
      expect(child({ pressed: false }).props.children).toBe(allSelected ? 'Deselect all' : 'Select all')
      const rest = StyleSheet.flatten(child({ pressed: false }).props.style)
      const pressed = StyleSheet.flatten(child({ pressed: true }).props.style)
      expect(rest.color).toBe(tokens.fg3)
      expect(pressed.color).toBe(tokens.fg1)
      expect(contrastOnSurface(String(pressed.color), [tokens.bg, tokens.bgSheet, tokens.bgHover])).toBeGreaterThanOrEqual(4.5)
      expect(StyleSheet.flatten(child({ pressed: false }).props.style)).toEqual(rest)
    }
  })

  it.each([false, true])('retains fills beside scale when motion is enabled (allSelected: %s)', (allSelected) => {
    state.reducedMotion = false
    for (const button of renderedButtons(<>{selectionTray(allSelected, false)}<PillButton variant="ghost">Ghost</PillButton></>)) {
      expect(resolvedStyle(button, true)).toMatchObject({ backgroundColor: createTokensV2('orange', state.mode).bgHover, transform: [{ scale: 0.96 }] })
      expect(resolvedStyle(button, false).transform).toBeUndefined()
    }
  })

  it('keeps disabled, loading and read-only controls at rest', () => {
    for (const button of renderedButtons(<>
      {selectionTray(false, true)}
      {selectionTray(false, false, true)}
      <PillButton variant="ghost" disabled>Disabled</PillButton>
      <PillButton variant="ghost" loading>Saving</PillButton>
    </>).filter((button) => button.props.disabled)) {
      expect(resolvedStyle(button, true)).toEqual(resolvedStyle(button, false))
      expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    }
  })
})
