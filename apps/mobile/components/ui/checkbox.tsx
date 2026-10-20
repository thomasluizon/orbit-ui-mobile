import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import type { CheckboxProps } from '@orbit/shared/contracts/forms'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { Check } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function Checkbox({
  checked,
  onChange,
  label,
  error = false,
  disabled = false,
  loading = false,
  as = 'button',
}: Readonly<CheckboxProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const box = (
    <View
      data-slot="checkbox-box"
      pointerEvents="none"
      style={styles.box}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24" style={StyleSheet.absoluteFill} accessible={false}>
        <Rect width={24} height={24} rx={8} fill={checked ? tokens.fg1 : 'transparent'} />
        {error || !checked ? <Rect x={1} y={1} width={22} height={22} rx={7} fill="none" stroke={error ? tokens.statusBad : tokens.fg3} strokeWidth={2} /> : null}
      </Svg>
      {loading ? (
        <ActivityIndicator size="small" color={tokens.bg} />
      ) : checked ? (
        <Check size={16} strokeWidth={3} color={tokens.bg} />
      ) : null}
    </View>
  )

  if (as === 'span') return box

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled || loading}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: disabled || loading, busy: loading }}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      style={styles.control}
    >
      {box}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  control: { minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
