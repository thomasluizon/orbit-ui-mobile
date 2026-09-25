import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { useTranslation } from 'react-i18next'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useRadioGroupItem } from '@/components/ui/radio-row'

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({
  selected,
  size,
  tokens,
}: Readonly<{ selected: boolean; size: number; tokens: AppTokensV2 }>) {
  return (
    <View
      style={[
        styles.glyph,
        { width: size, height: size },
        selected
          ? { backgroundColor: tokens.primary }
          : { borderWidth: 2, borderColor: tokens.trackEmpty },
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

/** Kit Radio: 24px circle, primary fill + white dot when selected, inset 2px empty track otherwise. */
interface SelectCheckProps {
  selected: boolean
  /** Circle size in px (default 24 per kit spec). */
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
  disabled?: boolean
  habitRowControl?: boolean
}

export function SelectCheck({
  selected,
  size = 24,
  onPress,
  accessibilityLabel,
  disabled = false,
  habitRowControl = false,
}: Readonly<SelectCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? t('common.select')}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: habitRowControl && pressed && !disabled ? tokens.bgHover : 'transparent',
        transform: [{ scale: habitRowControl && pressed && !disabled ? 0.96 : 1 }],
      })}
    >
      <RadioGlyph selected={selected} size={size} tokens={tokens} />
    </Pressable>
  )
}

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({
    disabled,
    onSelect,
    selected,
  })
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
      <RadioGlyph selected={selected} size={24} tokens={tokens} />
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
  const accessibilityLabel = [label, description, meta, tag, disabled ? reason : null]
    .filter(Boolean).join(', ')

  return disabled ? (
    <View {...navigationProps} ref={elementRef} accessibilityRole="radio" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: selected, disabled: true }} style={rowStyle}>{content}</View>
  ) : (
    <Pressable
      {...navigationProps}
      ref={elementRef}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onActivate}
      style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.99 }] } : null]}
    >{content}</Pressable>
  )
}

const styles = StyleSheet.create({
  glyph: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  row: { minHeight: 52, paddingRight: 16, paddingVertical: 8, borderWidth: 1.5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  leading: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 20.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tag: { fontFamily: 'Geist_600SemiBold', fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', flexShrink: 0 },
})
