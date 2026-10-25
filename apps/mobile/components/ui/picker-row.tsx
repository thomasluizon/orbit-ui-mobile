import { SPACING } from '@orbit/shared/theme'
import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { usePrefersReducedMotion } from '@/lib/motion'
import * as Primitive from '@rn-primitives/checkbox'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import type { createTokensV2 } from '@/lib/theme'

interface PickerRowProps {
  name: string
  selected: boolean
  proposed?: boolean
  disabled: boolean
  onToggle: () => void
  value: string
  valueStyle: StyleProp<TextStyle>
  valueHidden?: boolean
  children?: ReactNode
}

export function PickerRow({ name, selected, proposed = false, disabled, onToggle, value, valueStyle, valueHidden, children }: Readonly<PickerRowProps>) {
  const tokens = useThemeTokens()
  const reducedMotion = usePrefersReducedMotion()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.row}>
      <Primitive.Root onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} focusable={!disabled} checked={selected} onCheckedChange={onToggle} accessibilityRole="checkbox" accessibilityLabel={name} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onHoverIn={() => { if (proposed) setHovered(true) }} onHoverOut={() => setHovered(false)} style={({ pressed }) => [styles.rowMain, focused ? { outlineWidth: 2, outlineColor: tokens.fg1, outlineStyle: 'solid', outlineOffset: -2 } : null, disabled ? styles.disabled : null, hovered && !disabled ? styles.hovered : null, pressed ? [styles.pressed, reducedMotion ? { transform: [] } : null] : null]}>
        {({ pressed }) => <PersonalText style={[styles.rowTitle, proposed ? styles.proposedTitle : null, proposed && (pressed || hovered) ? styles.interactiveTitle : null]}>{name}</PersonalText>}
      </Primitive.Root>
      <View style={styles.rowActions}>
        <Text accessible={valueHidden ? false : undefined} style={valueStyle}>{value}</Text>
        <PersonalTextDetails iconOnly>{name}</PersonalTextDetails>
        {children}
      </View>
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: { borderRadius: 12, minWidth: 0, paddingHorizontal: SPACING.s12, paddingVertical: SPACING.s8 },
    rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 },
    rowMain: { overflow: 'hidden', borderRadius: 12, minHeight: 48, minWidth: 0, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, justifyContent: 'center' },
    rowTitle: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 16 },
    proposedTitle: { color: tokens.fg3 },
    interactiveTitle: { color: tokens.fg2 },
    hovered: { backgroundColor: tokens.bgHover },
    disabled: { opacity: 0.4 },
    pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
  })
}
