import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet, Text, View } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { Minus, Plus } from '@/components/ui/icons'

interface StepperProps { value: number; minimum: number; maximum?: number; lessLabel: string; moreLabel: string; description: string; colors: { fg1: string; fg2: string; fg3: string; bgWell: string; bgHover: string; hairline: string }; onChange: (value: number) => void }
/** A count control: minus, the value and plus, with what the count means beside it. */
export function Stepper({ value, minimum, maximum, lessLabel, moreLabel, description, colors, onChange }: Readonly<StepperProps>) {
  return <View style={styles.stepper}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={lessLabel} disabled={value <= minimum} style={({ pressed }) => [styles.stepButton, { backgroundColor: pressed ? colors.bgHover : colors.bgWell, borderColor: colors.hairline }, value <= minimum ? styles.disabled : null]} onPress={() => onChange(Math.max(minimum, value - 1))}><Minus size={20} strokeWidth={2} color={colors.fg2} /></MotionPressable>
    <Text style={[styles.quantity, { color: colors.fg1 }]}>{value}</Text>
    <MotionPressable accessibilityRole="button" accessibilityLabel={moreLabel} disabled={maximum !== undefined && value >= maximum} style={({ pressed }) => [styles.stepButton, { backgroundColor: pressed ? colors.bgHover : colors.bgWell, borderColor: colors.hairline }, maximum !== undefined && value >= maximum ? styles.disabled : null]} onPress={() => onChange(maximum === undefined ? value + 1 : Math.min(maximum, value + 1))}><Plus size={20} strokeWidth={2} color={colors.fg2} /></MotionPressable>
    <Text style={[styles.description, { color: colors.fg3 }]}>{description}</Text>
  </View>
}

const styles = StyleSheet.create({ stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stepButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, minHeight: TOUCH_TARGET_MIN, justifyContent: 'center', overflow: 'hidden', width: TOUCH_TARGET_MIN }, quantity: { fontFamily: 'GeistMono_500Medium', fontSize: 20, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }, description: { fontFamily: 'Geist_400Regular', fontSize: 14 }, disabled: { opacity: 0.4 } })
