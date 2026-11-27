import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { OptionCardProps } from '@orbit/shared/contracts/flow'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { SkeletonFace } from '@/components/ui/skeleton'
import { useFlowLook } from '@/components/ui/flow-look'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A quick option. A press answers. Selection takes the `--primary` ring and focus takes the `--fg-1` ring. A wide option holds one line and ends a long label with an ellipsis; its accessible name keeps the full label. An option that waits for its own request keeps its label over the skeleton face. */
export function OptionCard({ label, selected = false, disabled = false, disabledReason, loading = false, wide = false, onSelect, onHighlight }: Readonly<OptionCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const control = useRef<View>(null)
  const { lookAtControl, lookAway, wide: flowWide } = useFlowLook()
  return (
    <View style={[styles.wrapper, wide ? styles.wide : null]}>
      <MotionPressable
        ref={control}
        focusInset
        selectionRingWidth={2}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: disabled || loading, busy: loading }}
        disabled={disabled || loading}
        testID="option-card"
        onPress={onSelect}
        onFocus={() => { lookAtControl(control); onHighlight?.(true) }}
        onBlur={() => { lookAway(); onHighlight?.(false) }}
        style={({ pressed }) => [styles.card, flowWide ? styles.cardCompact : null, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard }, disabled && !loading ? styles.disabled : null]}
      >
        {loading ? <SkeletonFace tokens={tokens} /> : null}
        <Text style={[styles.label, { color: tokens.fg1 }]} numberOfLines={wide ? 1 : 2} ellipsizeMode="tail">{label}</Text>
      </MotionPressable>
      {disabled && disabledReason ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{disabledReason}</Text> : null}
    </View>
  )
}

/** The two-column grid that holds the quick options of one question. */
export const optionGridStyle = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 } }).grid

const styles = StyleSheet.create({
  wrapper: { width: '48%', gap: 4, minWidth: 0 },
  wide: { width: '100%' },
  card: { minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 12 },
  cardCompact: { minHeight: SMALL_PILL_VISIBLE_MIN, paddingVertical: 8 },
  disabled: { opacity: 0.5 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24, textAlign: 'center' },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
})
