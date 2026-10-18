import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAstraLineProps {
  text: string
  destination: string
  role?: 'button' | 'link'
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
}

export function TodayAstraLine({ text, destination, role = 'button', onPress, disabled = false, busy = false, announce = false, loading = false }: Readonly<TodayAstraLineProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <Pressable
      testID="today-astra-slot"
      accessibilityRole={role}
      accessibilityLabel={text}
      accessibilityLiveRegion={announce ? 'polite' : undefined}
      accessibilityHint={destination}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      style={[styles.line, { backgroundColor: tokens.bgWell }, focused ? { outlineStyle: 'solid', outlineWidth: 2, outlineColor: tokens.fg1, outlineOffset: 2 } : null]}
      onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
    >
      {!disabled && (pressed || hovered) ? <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.feedback, { backgroundColor: tokens.bgHoverOpaque }]} /> : null}
      <View accessible={false} style={{ width: 48, flexShrink: 0, alignItems: 'center' }}>
        <AstraGlyph size={20} color={tokens.fg3} />
      </View>
      {loading ? <View testID="summary-skeleton" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.skeleton}>
        <View style={[styles.placeholder, { backgroundColor: tokens.hairlineStrong }]} />
        <View style={[styles.placeholder, { backgroundColor: tokens.hairlineStrong, width: '66.67%' }]} />
      </View> : <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.text, { color: tokens.fg2 }]}>
        {text}
      </Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, paddingVertical: 8, borderRadius: 12 },
  feedback: { borderRadius: 12 },
  skeleton: { flex: 1, minWidth: 0, minHeight: 14 * 1.55 * 2, justifyContent: 'center', gap: 8 },
  placeholder: { height: 14, borderRadius: 8, width: '100%' },
  text: { minWidth: 0, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.55 },
})
