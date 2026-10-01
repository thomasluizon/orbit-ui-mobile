import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useRadioGroupItem } from '@/components/ui/radio-row'

const ROW_INDENTS = [16, 24, 32, 48, 64, 96] as const

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({
  selected,
  size,
  tokens,
  pressed = false,
}: Readonly<{ selected: boolean; size: number; tokens: AppTokensV2; pressed?: boolean }>) {
  return (
    <View
      style={[
        styles.glyph,
        { width: size, height: size },
        selected
          ? { backgroundColor: tokens.primary }
          : { borderWidth: 2, borderColor: pressed ? tokens.fg3 : tokens.trackEmpty },
      ]}
    >
      {selected ? (
        <View
          style={{
            width: Math.round(size * 0.375),
            height: Math.round(size * 0.375),
            borderRadius: 999,
            backgroundColor: tokens.fgOnPrimary,
          }}
        />
      ) : null}
    </View>
  )
}

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({
    disabled,
    onSelect,
    selected,
  })
  const content = (pressed = false) => {
    const secondaryColor = selected || pressed ? tokens.fg2 : tokens.fg3
    return (
      <>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.textBlock}>
          <Text style={[styles.label, { color: tokens.fg1 }]}>{label}</Text>
          {description ? <Text style={[styles.description, { color: secondaryColor }]}>{description}</Text> : null}
          {disabled && reason ? <Text style={[styles.reason, { color: secondaryColor }]}>{reason}</Text> : null}
        </View>
        {meta ? <Text style={[styles.meta, { color: secondaryColor }]}>{meta}</Text> : null}
        {tag ? <Text style={[styles.tag, { color: secondaryColor }]}>{tag}</Text> : null}
        <RadioGlyph selected={selected} size={24} tokens={tokens} pressed={pressed} />
      </>
    )
  }
  const rowStyle = [
    styles.row,
    {
      paddingLeft: ROW_INDENTS[Math.min(5, Math.max(0, Math.trunc(depth)))],
      backgroundColor: selected ? tokens.selectionBg : 'transparent',
      borderColor: selected ? tokens.primary : 'transparent',
      opacity: disabled ? 0.5 : 1,
    },
  ]
  const accessibilityLabel = [label, description, meta, tag, disabled ? reason : null]
    .filter(Boolean).join(', ')

  return disabled ? (
    <View {...navigationProps} ref={elementRef} accessibilityRole="radio" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: selected, disabled: true }} style={rowStyle}>{content()}</View>
  ) : (
    <Pressable
      {...navigationProps}
      ref={elementRef}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onActivate}
      style={({ pressed }) => [
        ...rowStyle,
        pressed ? { backgroundColor: tokens.bgHover } : null,
        pressed && !prefersReducedMotion ? { transform: [{ scale: 0.96 }] } : null,
      ]}
    >{({ pressed }) => content(pressed)}</Pressable>
  )
}

const styles = StyleSheet.create({
  glyph: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  row: { minHeight: 52, paddingRight: 16, paddingVertical: 8, borderWidth: 1.5, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12 },
  leading: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 20.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tag: { fontFamily: 'Geist_600SemiBold', fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', flexShrink: 0 },
})
