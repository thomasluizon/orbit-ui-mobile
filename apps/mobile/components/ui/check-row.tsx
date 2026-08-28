import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Checkbox } from './checkbox'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CheckRow({
  label,
  checked,
  onChange,
  description,
  error,
  value,
  disabled = false,
  loading = false,
}: Readonly<CheckRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled || loading}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={error ?? description}
      accessibilityState={{ checked, disabled: disabled || loading, busy: loading }}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: tokens.bgElev } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            { color: checked ? tokens.fg3 : tokens.fg1 },
            checked ? styles.checkedLabel : null,
          ]}
        >
          {label}
        </Text>
        {error || description ? (
          <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg3 }]}>
            {error ?? description}
          </Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text style={[styles.value, { color: tokens.fg3 }]}>{value}</Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 16 },
  checkedLabel: { textDecorationLine: 'line-through' },
  description: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
  value: { fontFamily: 'Roboto_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.6 },
})
