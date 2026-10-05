import { useState } from 'react'
import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { StyleSheet, Text, View } from 'react-native'
import { InsetFocusPressable as Pressable } from './inset-focus-pressable'
import { Checkbox } from './checkbox'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CheckRow({
  label,
  textMode,
  onOpenLabel,
  labelExpanded,
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
  const [pressed, setPressed] = useState(false)

  if (textMode === 'personal' && onOpenLabel) return <PersonalCheckRow label={label} onOpenLabel={onOpenLabel} labelExpanded={labelExpanded} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} tokens={tokens} />

  return (
    <Pressable
      focusOffset={-6}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
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
        pressed ? { backgroundColor: tokens.bgHover } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            { color: checked ? (pressed ? tokens.fg2 : tokens.fg3) : tokens.fg1 },
          ]}
        >
          {label}
        </Text>
        {error || description ? (
          <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg2 }]}>
            {error ?? description}
          </Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text style={[styles.value, { color: tokens.fg2 }]}>{value}</Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  personalRow: { minHeight: 68, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  personalCopy: { minWidth: 0, flex: 1, minHeight: 48, justifyContent: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  personalControl: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
  row: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 16 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.6 },
})

function PersonalCheckRow({ label, onOpenLabel, labelExpanded, checked, onChange, description, error, value, disabled, loading, tokens }: Readonly<CheckRowProps & { tokens: ReturnType<typeof createTokensV2> }>) {
  return (
    <View style={styles.personalRow}>
      <Pressable onPress={onOpenLabel} accessibilityRole="button" accessibilityLabel={label} accessibilityState={labelExpanded === undefined ? undefined : { expanded: labelExpanded }} style={({ pressed }) => [styles.personalCopy, pressed ? { backgroundColor: tokens.bgHover } : null]}>
        <Text numberOfLines={2} style={[styles.label, { color: tokens.fg1 }]}>{label}</Text>
        {error || description ? <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg2 }]}>{error ?? description}</Text> : null}
        {value !== undefined ? <Text style={[styles.value, { color: tokens.fg2 }]}>{value}</Text> : null}
      </Pressable>
      <Pressable onPress={() => onChange(!checked)} disabled={disabled || loading} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={error ?? description} accessibilityState={{ checked, disabled: disabled || loading, busy: loading }} data-loading={loading ? '' : undefined} style={({ pressed }) => [styles.personalControl, pressed ? { backgroundColor: tokens.bgHover } : null, disabled || loading ? styles.disabled : null]}>
        <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      </Pressable>
    </View>
  )
}
