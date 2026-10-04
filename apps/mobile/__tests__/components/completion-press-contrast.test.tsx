import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { controlContrast } from '@orbit/shared/__tests__/contrast'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { StatusDot } from '@/components/ui/status-dot'
import { createTokensV2 } from '@/lib/theme'

const theme = vi.hoisted(() => ({ currentScheme: 'orange', currentTheme: 'light' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))
vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof import('react-native')>()
  const { createElement, useState } = await import('react')
  return { ...native, Pressable: ({ style, children, disabled, onPress, ...props }: PressableProps) => {
    const [pressed, setPressed] = useState(false)
    return createElement('Pressable', {
      ...props, disabled,
      style: typeof style === 'function' ? style({ pressed }) : style,
      onPressIn: () => { if (!disabled) setPressed(true) },
      onPressOut: () => setPressed(false),
      onPress: disabled ? undefined : onPress,
    }, typeof children === 'function' ? children({ pressed }) : children)
  } }
})

function style(value: unknown): ViewStyle {
  return StyleSheet.flatten(value as StyleProp<ViewStyle>)
}

describe('completion control paint stack', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const kind of ['habit ring', 'status dot'] as const) {
      it(`retains the ${kind} contrast, target and action in ${mode}`, async () => {
        theme.currentTheme = mode
        const tokens = createTokensV2('orange', mode)
        const onToggle = vi.fn()
        const element = kind === 'habit ring'
          ? <CheckCircle state="empty" tokens={tokens} disabled={false} onToggle={onToggle} accessibilityLabel="Log habit" />
          : <StatusDot state="empty" onToggle={onToggle} accessibilityLabel="Log habit" />
        let tree!: ReactTestRenderer
        await act(() => { tree = create(element) })
        try {
          const control = () => tree.root.findAll((node) => String(node.type) === 'Pressable')[0]!
          const props = () => control().props as { style: StyleProp<ViewStyle>; onPressIn: () => void; onPressOut: () => void; onPress?: () => void; accessibilityState: { disabled: boolean } }
          const track = () => kind === 'habit ring'
            ? tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'status-ring')[0]!
            : control().findAll((node) => String(node.type) === 'View')[0]!
          const resting = style(props().style)
          expect(resting.minHeight).toBe(48)
          expect(resting.width ?? resting.minWidth).toBe(48)
          const color = String(style(track().props.style).borderColor)
          expect(color).toBe(tokens.statusEmpty)
          for (const pressed of [false, true, false]) {
            await act(() => { props()[pressed ? 'onPressIn' : 'onPressOut']() })
            const parent = style(props().style)
            const trackStyle = style(track().props.style)
            expect(trackStyle.borderColor).toBe(color)
            for (const surface of [tokens.bgCard, tokens.bg]) {
              const measured = controlContrast(color, parent.backgroundColor === 'transparent' || !parent.backgroundColor ? 'rgba(0,0,0,0)' : String(parent.backgroundColor), [tokens.bg, surface], Number(parent.opacity ?? 1), Number(trackStyle.opacity ?? 1))
              expect(measured.graphic).toBeGreaterThanOrEqual(3)
              if (pressed) expect(measured.step).toBeGreaterThanOrEqual(1.25)
            }
            expect(parent.width ?? parent.minWidth).toBe(48)
            expect(parent.minHeight).toBe(48)
          }
          await act(() => { props().onPress!() })
          expect(onToggle).toHaveBeenCalledOnce()
          const disabled = kind === 'habit ring'
            ? <CheckCircle state="empty" tokens={tokens} disabled onToggle={onToggle} accessibilityLabel="Log habit" />
            : <StatusDot state="empty" disabled onToggle={onToggle} accessibilityLabel="Log habit" />
          await act(() => { tree.update(disabled); })
          await act(() => { props().onPressIn() })
          expect(style(props().style).opacity).toBeCloseTo(0.4)
          expect(props().accessibilityState.disabled).toBe(true)
          expect(props().onPress).toBeUndefined()
          expect(onToggle).toHaveBeenCalledOnce()
        } finally { await act(() => tree.update(<></>)) }
      })
    }
  }
})
