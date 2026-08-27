import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.textBlock}>
        <Text style={[styles.label, { color: tokens.fg1 }]}>{label}</Text>
        {description ? <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text> : null}
        {disabled && reason ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{reason}</Text> : null}
      </View>
      {meta ? <Text style={[styles.meta, { color: tokens.fg3 }]}>{meta}</Text> : null}
      {tag ? <Text style={[styles.tag, { color: tokens.fg3 }]}>{tag}</Text> : null}
      <View style={[styles.radio, selected ? { backgroundColor: tokens.primary } : { borderColor: tokens.hairlineStrong, borderWidth: 1.5 }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: tokens.fgOnPrimary }]} /> : null}
      </View>
    </>
  )
  const rowStyle = [
    styles.row,
    {
      paddingLeft: 20 + Math.max(0, depth) * 20,
      backgroundColor: selected ? tokens.selectionBg : 'transparent',
      borderColor: selected ? tokens.primary : 'transparent',
      opacity: disabled ? 0.5 : 1,
    },
  ]

  return disabled ? (
    <View accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: true }} style={rowStyle}>{content}</View>
  ) : (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onSelect} style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: tokens.bgElevPressed, transform: [{ scale: 0.99 }] } : null]}>{content}</Pressable>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, paddingRight: 16, paddingVertical: 8, borderWidth: 1.5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  leading: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 20.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  meta: { fontFamily: 'Roboto_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tag: { fontFamily: 'Geist_600SemiBold', fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', flexShrink: 0 },
  radio: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 9, height: 9, borderRadius: 999 },
})
