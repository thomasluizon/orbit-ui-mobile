import { SPACING } from '@orbit/shared/theme'
import { PersonalText } from '@/components/ui/personal-text'
import { useState } from 'react'
import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { ActivityIndicator, Pressable as NativePressable, StyleSheet, Text, View, useWindowDimensions, type PressableProps, type ViewStyle } from 'react-native'
import { InsetFocusPressable as Pressable } from './inset-focus-pressable'
import { Checkbox } from './checkbox'
import { Check, CheckCircle, Circle } from './icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CheckRow({
  label,
  placement = 'inset',
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

  if (textMode === 'personal' && onOpenLabel) return <PersonalCheckRow placement={placement} label={label} variant={variant} onOpenLabel={onOpenLabel} labelExpanded={labelExpanded} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} tokens={tokens} />
  if (placement === 'column') return <ColumnCheckRow label={label} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} tokens={tokens} />

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
  columnRow: { width: '100%', minHeight: 52, position: 'relative', flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: SPACING.s12 },
  columnFill: { position: 'absolute', top: 0, bottom: 0, left: -16, right: -16, borderRadius: 12 },
  columnLabel: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8 },
  labelFill: { position: 'absolute', top: -12, bottom: -12, left: -12, right: 0, borderRadius: 12, overflow: 'hidden' },
  calendarDayControlFill: { borderRadius: 24 },
  controlFill: { position: 'absolute', top: -12, bottom: -12, left: -12, right: -12, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: SPACING.s12 },
  personalRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s12 },
  personalAction: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  personalCopy: { minWidth: 0, flex: 1, minHeight: 24, justifyContent: 'center', gap: 4, borderRadius: 12 },
  calendarDayRow: { minHeight: 68, paddingVertical: SPACING.s0 },
  calendarDayCopy: { minHeight: 68, paddingVertical: SPACING.s12 },
  calendarDayLabelFill: { top: 0, bottom: 0 },
  personalControl: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, },
  row: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s12, borderRadius: 12, overflow: 'hidden' },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 16 },
  calendarDayLabel: { fontFamily: 'Geist_400Regular', lineHeight: 22.4 },
  calendarDayValue: { fontSize: 12, lineHeight: 16.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.6 },
})

function ColumnCheckRow({ label, checked, onChange, description, error, value, disabled, loading, tokens }: Readonly<CheckRowProps & { tokens: ReturnType<typeof createTokensV2> }>) {
  const { fontScale } = useWindowDimensions()
  return <PersonalControl tokens={tokens} fillStyle={styles.columnFill} hitSlop={{ left: 16, right: 16 }} onPress={() => onChange(!checked)} disabled={disabled || loading} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={error ?? description} accessibilityState={{ checked, disabled: disabled || loading, busy: loading }} style={[styles.columnRow, { minHeight: error || description ? 68 : 52 }, disabled || loading ? styles.disabled : null]}>
    <View style={[styles.copy, { minHeight: Math.max(28, 23.8 * fontScale), justifyContent: 'center' }]}>
      <Text style={[styles.columnLabel, { color: tokens.fg1 }]}>{label}</Text>
      {error || description ? <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg2 }]}>{error ?? description}</Text> : null}
    </View>
    {value !== undefined ? <Text style={[styles.value, { color: tokens.fg2 }]}>{value}</Text> : null}
    <View data-slot="check-row-tick" importantForAccessibility="no-hide-descendants" style={{ width: 16, minHeight: Math.max(28, 23.8 * fontScale), alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <ActivityIndicator size="small" color={tokens.fg1} /> : checked ? <Check size={16} color={tokens.fg1} strokeWidth={1.5} /> : null}
    </View>
  </PersonalControl>
}

function getPersonalRowStyle(calendarDay: boolean, supportingText: boolean, placement: CheckRowProps['placement']) {
  return [styles.personalRow, placement === 'column' ? { marginHorizontal: -SPACING.s16 } : null, calendarDay ? styles.calendarDayRow : { minHeight: supportingText ? 68 : 52 }]
}

function getPersonalLabelFill(calendarDay: boolean) {
  return calendarDay ? { ...styles.labelFill, ...styles.calendarDayLabelFill } : styles.labelFill
}

function getPersonalControlFill(calendarDay: boolean) {
  return calendarDay ? { ...styles.controlFill, ...styles.calendarDayControlFill } : styles.controlFill
}

function CalendarDayCircle({ checked, color }: Readonly<{ checked: boolean; color: string }>) {
  const CircleIcon = checked ? CheckCircle : Circle
  return <CircleIcon data-slot="calendar-day-circle" size={24} strokeWidth={1.5} color={color} accessible={false} />
}

function PersonalCheckRowContent({ label, placement, variant, labelExpanded, error, description, value, tokens }: Readonly<Pick<CheckRowProps, 'label' | 'placement' | 'variant' | 'labelExpanded' | 'error' | 'description' | 'value'> & { tokens: ReturnType<typeof createTokensV2> }>) {
  const calendarDay = variant === 'calendar-day'
  const expanded = placement === 'column' && labelExpanded
  return (
      <View pointerEvents={expanded ? "box-none" : "none"} importantForAccessibility={expanded ? "auto" : "no-hide-descendants"} style={{ gap: 4 }}>
        <PersonalText expanded={expanded} style={[styles.label, calendarDay ? styles.calendarDayLabel : null, { color: tokens.fg1 }]}>{label}</PersonalText>
        {error || description || value !== undefined ? <View pointerEvents="none" style={{ gap: 4 }}>
          {error || description ? <Text style={[styles.description, { color: error ? tokens.statusBadText : tokens.fg2 }]}>{error ?? description}</Text> : null}
          {value !== undefined ? <Text style={[styles.value, calendarDay ? styles.calendarDayValue : null, { color: tokens.fg2 }]}>{value}</Text> : null}
        </View> : null}
      </View>
  )
}

function PersonalCheckRow({ label, placement, variant, onOpenLabel, labelExpanded, checked, onChange, description, error, value, disabled, loading, tokens }: Readonly<CheckRowProps & { tokens: ReturnType<typeof createTokensV2> }>) {
  const calendarDay = variant === 'calendar-day'
  return (
    <View data-slot="list-row-body" style={getPersonalRowStyle(calendarDay, Boolean(error || description || value !== undefined), placement)}>
      <View style={[styles.personalCopy, calendarDay ? styles.calendarDayCopy : null]}>
      <PersonalControl disabled={disabled} focusable={!disabled} tokens={tokens} fillStyle={getPersonalLabelFill(calendarDay)} hitSlop={{ top: calendarDay ? 0 : 12, bottom: calendarDay ? 0 : 12, left: 12 }} onPress={onOpenLabel} accessibilityRole="button" accessibilityLabel={label} accessibilityState={labelExpanded === undefined ? undefined : { expanded: labelExpanded }} style={styles.personalAction} />
      <PersonalCheckRowContent label={label} placement={placement} variant={variant} labelExpanded={labelExpanded} error={error} description={description} value={value} tokens={tokens} />
      </View>
      <PersonalControl tokens={tokens} fillStyle={getPersonalControlFill(calendarDay)} containContent focusable={!disabled && !loading} hitSlop={12} onPress={() => onChange(!checked)} disabled={disabled || loading} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={error ?? description} accessibilityState={{ checked, disabled: disabled || loading, busy: loading }} data-loading={loading ? '' : undefined} style={[styles.personalControl, disabled || loading ? styles.disabled : null]}>
        {calendarDay ? <CalendarDayCircle checked={checked} color={tokens.fg1} /> : <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />}
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
