import React from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { Animated } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, orbitalMotion } from '@orbit/shared/theme'
import { Composer } from '@/components/shell/composer'
import { createTokensV2 } from '@/lib/theme'
import { expectPressScaleLayer, pressableStyle } from '@/__tests__/support/press-feedback'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

const motionState = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => motionState.reduced }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }) } }))
vi.mock('expo-clipboard', () => ({ getStringAsync: vi.fn().mockResolvedValue(''), hasStringAsync: vi.fn().mockResolvedValue(true) }))

const words = { placeholder: 'Message', send: 'Send', clear: 'Clear', paste: 'Paste', nothingToPaste: 'Empty', actions: 'Actions', suggestionsLabel: 'Suggestions' }
const suggestions = ['Log your next habit', 'Move a habit to tonight', 'Review habit steps']
  .map((label, index) => ({ id: `chip-${index}`, label, onSelect: vi.fn() })) as unknown as ComposerSuggestions
const props: ComposerProps = { words, value: '', state: 'idle', suggestions, onChangeValue: vi.fn(), onSend: vi.fn() }
const tokens = createTokensV2('orange', 'dark')
let tree: ReactTestRenderer

function render(overrides: Record<string, unknown> = {}) {
  void TestRenderer.act(() => { tree = TestRenderer.create(<Composer {...props} {...overrides} />) })
}

function button(label: string): ReactTestInstance {
  const hosts = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)
  expect(hosts).toHaveLength(1)
  return hosts[0]!
}

afterEach(() => {
  motionState.reduced = false
  vi.restoreAllMocks()
  void TestRenderer.act(() => tree.unmount())
})

describe('Android suggestion chip press motion', () => {
  it.each([false, true])('scales a pressed chip to 0.96 on the press tokens, and holds it at 1 with its press fill under reduced motion (reduced motion: %s)', (reduced) => {
    motionState.reduced = reduced
    render()
    for (const label of suggestions.map((suggestion) => suggestion.label)) {
      const chip = button(label)
      expectPressScaleLayer(chip, reduced)
      expect(pressableStyle(chip, true)).toMatchObject({ backgroundColor: tokens.bgHover })
    }
    void TestRenderer.act(() => (button(suggestions[1]!.label).props.onPress as () => void)())
    expect(suggestions[1]!.onSelect).toHaveBeenCalledOnce()
    vi.mocked(suggestions[1]!.onSelect).mockClear()
  })
})

describe('Android composer motion', () => {
  it.each([false, true])('grows and shrinks the input with the conversation change timing, and at once under reduced motion (reduced motion: %s)', (reduced) => {
    motionState.reduced = reduced
    const duration = vi.spyOn(Reanimated.LinearTransition, 'duration')
    render({ value: 'First line\nSecond line' })
    const slot = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'composer-text-slot')[0]!
    if (reduced) {
      expect(slot.props.layout).toBeUndefined()
      expect(duration).not.toHaveBeenCalled()
    } else {
      expect(slot.props.layout).toBe(Reanimated.LinearTransition)
      expect(duration).toHaveBeenCalledWith(motionDurations.micro)
    }
  })

  it.each([false, true])('scales the conversation entry glyph on the press tokens, and keeps it still under reduced motion (reduced motion: %s)', (reduced) => {
    motionState.reduced = reduced
    const timing = vi.spyOn(Animated, 'timing')
    const onOpenConversation = vi.fn()
    render({ onOpenConversation, conversationLabel: 'Open the conversation' })
    const entry = button('Open the conversation')
    const glyph = entry.findAll((node) => (node.type as unknown) === 'AnimatedView')[0]!
    const scale = (glyph.props.style as { transform: [{ scale: { value: number } }] }).transform[0].scale
    void TestRenderer.act(() => (entry.props.onPressIn as () => void)())
    if (reduced) {
      expect(timing).not.toHaveBeenCalled()
      expect(scale.value).toBe(1)
    } else {
      expect(timing).toHaveBeenLastCalledWith(scale, expect.objectContaining({ toValue: orbitalMotion.press.scale, duration: motionDurations.press }))
    }
    void TestRenderer.act(() => (entry.props.onPressOut as () => void)())
    if (reduced) expect(timing).not.toHaveBeenCalled()
    else expect(timing).toHaveBeenLastCalledWith(scale, expect.objectContaining({ toValue: 1, duration: motionDurations.press }))
    void TestRenderer.act(() => (entry.props.onPress as () => void)())
    expect(onOpenConversation).toHaveBeenCalledOnce()
  })
})
