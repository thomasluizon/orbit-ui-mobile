import { PersonalText } from '@/components/ui/personal-text'
import { useState } from 'react'
import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { Pressable as NativePressable, StyleSheet, Text, View, type PressableProps, type ViewStyle } from 'react-native'
import { InsetFocusPressable as Pressable } from './inset-focus-pressable'
import { Checkbox } from './checkbox'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CheckRow({
  label,
  textMode,
  variant,
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

  if (textMode === 'personal' && onOpenLabel) return <PersonalCheckRow label={label} variant={variant} onOpenLabel={onOpenLabel} labelExpanded={labelExpanded} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} tokens={tokens} />

  return (
    <Pressable
      data-slot="list-row-body"
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
        { minHeight: error || description ? 68 : 52 },
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
  labelFill: { position: 'absolute', top: -12, bottom: -12, left: -12, right: 0, borderRadius: 12, overflow: 'hidden' },
  controlFill: { position: 'absolute', top: -12, bottom: -12, left: -12, right: -12, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 12 },
  personalRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  personalCopy: { minWidth: 0, flex: 1, minHeight: 24, justifyContent: 'center', gap: 4, borderRadius: 12 },
  personalControl: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, },
  row: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, overflow: 'hidden' },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 16 },
  calendarDayLabel: { fontFamily: 'Geist_400Regular', lineHeight: 22.4 },
  calendarDayValue: { fontSize: 12, lineHeight: 16.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.6 },
})

function PersonalCheckRow({ label, variant, onOpenLabel, labelExpanded, checked, onChange, description, error, value, disabled, loading, tokens }: Readonly<CheckRowProps & { tokens: ReturnType<typeof createTokensV2> }>) {
  const calendarDay = variant === 'calendar-day'
  return (
    <View data-slot="list-row-body" style={[styles.personalRow, { minHeight: calendarDay || error || description || value !== undefined ? 68 : 52 }]}>
      <PersonalControl tokens={tokens} fillStyle={styles.labelFill} hitSlop={{ top: 12, bottom: 12, left: 12 }} onPress={onOpenLabel} accessibilityRole="button" accessibilityLabel={label} accessibilityState={labelExpanded === undefined ? undefined : { expanded: labelExpanded }} style={styles.personalCopy}>
        <PersonalText style={[styles.label, calendarDay ? styles.calendarDayLabel : null, { color: tokens.fg1 }]}>{label}</PersonalText>
        {error || description ? <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg2 }]}>{error ?? description}</Text> : null}
        {value !== undefined ? <Text style={[styles.value, calendarDay ? styles.calendarDayValue : null, { color: tokens.fg2 }]}>{value}</Text> : null}
      </PersonalControl>
      <PersonalControl tokens={tokens} fillStyle={styles.controlFill} containContent hitSlop={12} onPress={() => onChange(!checked)} disabled={disabled || loading} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={error ?? description} accessibilityState={{ checked, disabled: disabled || loading, busy: loading }} data-loading={loading ? '' : undefined} style={[styles.personalControl, disabled || loading ? styles.disabled : null]}>
        <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      </PersonalControl>
    </View>
  )
}

function PersonalControl({ tokens, fillStyle, containContent = false, children, ...props }: Readonly<PressableProps & { tokens: ReturnType<typeof createTokensV2>; fillStyle: ViewStyle; containContent?: boolean }>) {
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  return <NativePressable {...props} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
    {(state) => <>
      <View pointerEvents="none" accessible={false} data-press-fill="" style={[fillStyle, { backgroundColor: !props.disabled && (state.pressed || pressed || focused || hovered) ? tokens.bgHover : 'transparent', outlineWidth: !props.disabled && focused ? 2 : 0, outlineOffset: -2, outlineStyle: 'solid', outlineColor: tokens.fg1 }]}>{containContent ? (typeof children === 'function' ? children(state) : children) : null}</View>
      {containContent ? null : typeof children === 'function' ? children(state) : children}
    </>}
  </NativePressable>
}
