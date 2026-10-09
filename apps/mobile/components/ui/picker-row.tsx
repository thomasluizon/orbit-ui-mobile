import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import type { createTokensV2 } from '@/lib/theme'

interface PickerRowProps {
  name: string
  selected: boolean
  disabled: boolean
  onToggle: () => void
  value: string
  valueStyle: StyleProp<TextStyle>
  valueHidden?: boolean
  children?: ReactNode
}

export function PickerRow({ name, selected, disabled, onToggle, value, valueStyle, valueHidden, children }: Readonly<PickerRowProps>) {
  const tokens = useThemeTokens()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  return (
    <View style={styles.row}>
      <MotionPressable focusInset accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected, disabled }} disabled={disabled} style={({ pressed }) => [styles.rowMain, disabled ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={onToggle}>
        <PersonalText style={styles.rowTitle}>{name}</PersonalText>
      </MotionPressable>
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
    row: { borderRadius: 12, minWidth: 0, paddingHorizontal: 12, paddingVertical: 8 },
    rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 },
    rowMain: { overflow: 'hidden', borderRadius: 12, minHeight: 48, minWidth: 0, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
    rowTitle: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 16 },
    disabled: { opacity: 0.4 },
    pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
  })
}
