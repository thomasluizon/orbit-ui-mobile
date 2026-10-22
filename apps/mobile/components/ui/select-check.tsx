import { SPACING } from '@orbit/shared/theme'
import { useState } from 'react'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { selectedBorderStyle } from '@/components/ui/selected-focus-indicator'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useRadioGroupItem } from '@/components/ui/radio-row'

const ROW_INDENTS = [SPACING.s16, SPACING.s24, SPACING.s32, SPACING.s48, SPACING.s64, SPACING.s96] as const

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({
  selected,
  size,
  tokens,
  pressed = false,
}: Readonly<{ selected: boolean; size: number; tokens: AppTokensV2; pressed?: boolean }>) {
  return (
    <View
      data-slot="list-row-trailing"
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

export function RadioRow({ label, selection, hideMeta, wrapLabel, textMode, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason, proposed = false }: Readonly<RadioRowProps>) {
  const { fontScale } = useWindowDimensions()
  const [disclosed, setDisclosed] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const themeTokens = createTokensV2(currentScheme, currentTheme)
  const tokens = proposed ? { ...themeTokens, primary: themeTokens.fg3, selectionBg: themeTokens.bgWell } : themeTokens
  const prefersReducedMotion = usePrefersReducedMotion()
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({
    disabled,
    onSelect,
    selected,
  })
  const wrappingStyle = wrapLabel ? { lineHeight: 22.4 } : null
  const controlMinHeight = wrapLabel ? 22.4 * fontScale : undefined
  const supportingReason = Boolean(disabled && textMode === 'personal' && reason)
  const content = (pressed = false) => {
    const labelColor = selection && !selected ? tokens.fg2 : tokens.fg1
    const secondaryColor = pressed || (selected && !proposed) ? tokens.fg2 : tokens.fg3
    const personalColor = proposed ? secondaryColor : tokens.fg1
    const optionColor = proposed ? secondaryColor : labelColor
    const title = <>
        {leading ? <View data-slot="list-row-icon" style={styles.leading}>{leading}</View> : null}
        <View style={styles.textBlock}>
          {textMode === 'personal' ? <PersonalText data-slot="list-row-title" expanded={disabled ? disclosed : selected} style={[styles.label, { color: personalColor, lineHeight: 22.4 }]}>{label}</PersonalText> : <Text data-slot="list-row-title" style={[styles.label, { color: optionColor }, wrappingStyle]}>{label}</Text>}
          {description ? <Text style={[styles.description, { color: secondaryColor }]}>{description}</Text> : null}
          {!supportingReason && disabled && reason ? <Text style={[styles.reason, { color: secondaryColor }]}>{reason}</Text> : null}
        </View>
      </>
    const metadata = <RadioRowMetadata meta={meta} hideMeta={hideMeta} tag={tag} secondaryColor={secondaryColor} supportingReason={supportingReason} />
    const glyph = <View data-slot="radio-row-control" style={{ justifyContent: 'center', minHeight: controlMinHeight }}>
      <RadioGlyph selected={selected} size={24} tokens={tokens} pressed={pressed} />
    </View>
    return supportingReason ? <View style={{ flex: 1, minWidth: 0, gap: SPACING.s8 }}>
      <View style={{ minHeight: 48, flexDirection: 'row', minWidth: 0, alignItems: 'flex-start', gap: SPACING.s12 }}>{title}{glyph}</View>
      {metadata}
      <Text style={[styles.reason, { color: secondaryColor }]}>{reason}</Text>
    </View> : <>{title}{metadata}{glyph}</>
  }
  const rowStyle = [
    styles.row,
    {
      alignItems: wrapLabel ? 'flex-start' as const : 'center' as const,
      paddingLeft: ROW_INDENTS[Math.min(5, Math.max(0, Math.trunc(depth)))],
      backgroundColor: selected ? tokens.selectionBg : 'transparent',
      borderColor: 'transparent',
      opacity: disabled ? 0.5 : 1,
    },
  ]
  const accessibilityLabel = [label, description, meta, tag, disabled ? reason : null]
    .filter(Boolean).join(', ')

  return disabled ? (
    <View style={{ flexDirection: 'row', minWidth: 0, alignItems: 'center' }}><View data-slot="list-row-body" {...navigationProps} ref={elementRef} accessibilityRole="radio" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: selected, disabled: true }} style={[rowStyle, selectedBorderStyle(selected, false, 1.5, tokens.primary), { flex: 1, minWidth: 0 }]}>{content()}</View>{textMode === 'personal' ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: disclosed }} onPress={() => setDisclosed(!disclosed)} style={({ pressed }) => ({ minHeight: 48, minWidth: 48, ...(supportingReason && { alignSelf: 'flex-start' as const }), padding: SPACING.s8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent' })}><ChevronDown accessible={false} color={tokens.fg2} size={20} strokeWidth={2} style={disclosed ? { transform: [{ rotate: '180deg' }] } : undefined} /></InsetFocusPressable> : null}</View>
  ) : (
    <InsetFocusPressable selectionRingWidth={1.5} selectionRingColor={tokens.primary}
      data-slot="list-row-body"
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
    >{({ pressed }) => content(pressed)}</InsetFocusPressable>
  )
}

function RadioRowMetadata({ meta, hideMeta, tag, secondaryColor, supportingReason }: Readonly<Pick<RadioRowProps, 'meta' | 'hideMeta' | 'tag'> & { secondaryColor: string; supportingReason: boolean }>) {
  if ((!meta || hideMeta) && !tag) return null
  const metadata = <>
    {meta && !hideMeta ? <Text style={[styles.meta, { color: secondaryColor }]}>{meta}</Text> : null}
    {tag ? <Text style={[styles.tag, { color: secondaryColor }]}>{tag}</Text> : null}
  </>
  return supportingReason ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', minWidth: 0, alignItems: 'center', gap: SPACING.s12 }}>{metadata}</View> : metadata
}

const styles = StyleSheet.create({
  glyph: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  row: { minHeight: 52, paddingRight: SPACING.s16, paddingVertical: SPACING.s8, borderWidth: 1.5, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12 },
  leading: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 20.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tag: { fontFamily: 'Geist_600SemiBold', fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', flexShrink: 0 },
})
