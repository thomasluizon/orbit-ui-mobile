import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { OptionCardProps } from '@orbit/shared/contracts/flow'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { useFlowLook } from '@/components/ui/flow-look'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A quick option. A press answers. Selection takes the `--primary` ring and focus takes the `--fg-1` ring. */
export function OptionCard({ label, selected = false, disabled = false, disabledReason, onSelect, onHighlight }: Readonly<OptionCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const control = useRef<View>(null)
  const { lookAtControl, lookAway } = useFlowLook()
  return (
    <View style={styles.wrapper}>
      <MotionPressable
        ref={control}
        focusInset
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        testID="option-card"
        onPress={onSelect}
        onFocus={() => { lookAtControl(control); onHighlight?.(true) }}
        onBlur={() => { lookAway(); onHighlight?.(false) }}
        style={({ pressed }) => [styles.card, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard }, disabled ? styles.disabled : null]}
      >
        <Text style={[styles.label, { color: tokens.fg1 }]} numberOfLines={2}>{label}</Text>
      </MotionPressable>
      {disabled && disabledReason ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{disabledReason}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { width: '48%', gap: 4, minWidth: 0 },
  card: { minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 12 },
  disabled: { opacity: 0.5 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24, textAlign: 'center' },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
})
