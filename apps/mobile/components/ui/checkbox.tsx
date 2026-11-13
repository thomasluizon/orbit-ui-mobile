import { useState } from 'react'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import type { CheckboxProps } from '@orbit/shared/contracts/forms'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import * as Primitive from '@rn-primitives/checkbox'
import { PressScale } from '@/components/motion/press-scale'
import { selectionSettleTransition } from '@/components/motion/selection-settle'
import Svg, { Rect } from 'react-native-svg'
import { Check } from '@/components/ui/icons'
import { SkeletonFace } from '@/components/ui/skeleton'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

const AnimatedBox = Animated.createAnimatedComponent(View)

/**
 * The 24px box. Its fill settles on the selection preset. While its request runs, its face is the skeleton and the
 * check reads `fg1` on it, so the state stays visible.
 */
function CheckboxBox({ checked, error, loading }: Readonly<Pick<CheckboxProps, 'checked'> & { error: boolean; loading: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const filled = checked && !loading
  return (
    <AnimatedBox
      data-slot="checkbox-box"
      pointerEvents="none"
      style={[styles.box, { backgroundColor: filled ? tokens.statusDone : 'transparent', transition: selectionSettleTransition('background-color', filled, reducedMotion) }]}
    >
      {loading ? <SkeletonFace /> : null}
      {error || !(checked || loading) ? (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={StyleSheet.absoluteFill} accessible={false}>
          <Rect x={1} y={1} width={22} height={22} rx={7} fill="none" stroke={error ? tokens.statusBad : tokens.fg3} strokeWidth={2} />
        </Svg>
      ) : null}
      {checked ? <Check size={16} strokeWidth={3} color={loading ? tokens.fg1 : tokens.bg} /> : null}
    </AnimatedBox>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  error = false,
  disabled = false,
  loading = false,
  as = 'button',
}: Readonly<CheckboxProps>) {
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const box = <CheckboxBox checked={checked} error={error} loading={loading} />

  if (as === 'span') return box

  return (
    <Primitive.Root
      checked={checked}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      focusable={!disabled && !loading}
      onCheckedChange={(next) => onChange(next === true)}
      disabled={disabled || loading}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: disabled || loading, busy: loading }}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      style={[styles.control, focused ? { outlineWidth: 2, outlineColor: tokens.fg1, outlineOffset: -2, outlineStyle: 'solid' } : null]}
    >
      <PressScale pressed={pressed} disabled={disabled || loading}>{box}</PressScale>
    </Primitive.Root>
  )
}

const styles = StyleSheet.create({
  control: { minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
