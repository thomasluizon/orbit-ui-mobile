import { surfaceHighlighted, useNestedSlotFeedback, useRowFeedback } from '@/hooks/use-row-feedback'
import { SPACING } from '@orbit/shared/theme'
import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { usePrefersReducedMotion } from '@/lib/motion'
import * as Primitive from '@rn-primitives/toggle'
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
  const [clamped, setClamped] = useState(false)
  const tokens = useThemeTokens()
  const reducedMotion = usePrefersReducedMotion()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const feedback = useRowFeedback(disabled)
  const slot = useNestedSlotFeedback()
  const highlighted = surfaceHighlighted(feedback.highlighted, [slot])
  return (
    <View style={styles.row}>
      <View pointerEvents="none" accessible={false} testID="picker-row-feedback" style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: highlighted ? tokens.bgHover : 'transparent', outlineWidth: feedback.focused ? 2 : 0, outlineColor: tokens.fg1, outlineStyle: 'solid', outlineOffset: -2 }]} />
      <Primitive.Root {...feedback.handlers} focusable={!disabled} pressed={selected} onPressedChange={onToggle} role={undefined} aria-checked={undefined} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected, disabled }} disabled={disabled} style={({ pressed }) => [styles.rowMain, disabled ? styles.disabled : null, pressed && !reducedMotion ? { transform: [{ scale: 0.96 }] } : null]}>
        {({ pressed }) => <PersonalText onClampedChange={setClamped} style={[styles.rowTitle, proposed ? styles.proposedTitle : null, proposed && (pressed || highlighted) ? styles.interactiveTitle : null]}>{name}</PersonalText>}
      </Primitive.Root>
      <View style={styles.rowActions}>
        <Text accessible={valueHidden ? false : undefined} style={[valueStyle, highlighted && StyleSheet.flatten(valueStyle ?? {}).color === tokens.fg3 ? { color: tokens.fg2 } : null]}>{value}</Text>
        <View testID="picker-row-controls" {...slot.handlers} style={styles.rowControls}>
          <PersonalTextDetails iconOnly clamped={clamped}>{name}</PersonalTextDetails>
          {children}
        </View>
      </View>
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: { borderRadius: 12, minWidth: 0, paddingHorizontal: SPACING.s12, paddingVertical: SPACING.s8 },
    rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 },
    rowControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowMain: { overflow: 'hidden', borderRadius: 12, minHeight: 48, minWidth: 0, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, justifyContent: 'center' },
    rowTitle: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 16 },
    proposedTitle: { color: tokens.fg3 },
    interactiveTitle: { color: tokens.fg2 },
    disabled: { opacity: 0.4 },
  })
}
