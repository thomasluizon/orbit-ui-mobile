import type { CheckboxProps } from '@orbit/shared/contracts/forms'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
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
      pointerEvents="none"
      style={[
        styles.box,
        {
          backgroundColor: checked ? tokens.fg1 : 'transparent',
          borderColor: error ? tokens.statusBad : checked ? 'transparent' : tokens.fg3,
          borderWidth: error || !checked ? 2 : 0,
        },
      ]}
    >
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
  control: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
