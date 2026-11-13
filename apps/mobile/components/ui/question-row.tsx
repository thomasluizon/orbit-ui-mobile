import { StyleSheet, Text, View } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface QuestionRowProps {
  /** The question in the words of the person. It is the visible label and the accessible name. */
  question: string
  /** The current answer. */
  value?: string
  onPress: () => void
}

/** A row that asks a question and shows its current answer. A press opens the step that owns the answer. */
export function QuestionRow({ question, value, onPress }: Readonly<QuestionRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <MotionPressable focusInset accessibilityRole="button" accessibilityLabel={value ? `${question} ${value}` : question} testID="question-row" onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tokens.bgHover : tokens.bgField }]}>
      <View style={styles.text}><Text style={[styles.question, { color: tokens.fg1 }]}>{question}</Text></View>
      {value ? <Text numberOfLines={1} style={[styles.value, { color: tokens.fg2 }]}>{value}</Text> : null}
      <ChevronRight color={tokens.fg3} size={20} />
    </MotionPressable>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  text: { flex: 1, minWidth: 0 },
  question: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
  value: { maxWidth: '40%', fontFamily: 'Geist_400Regular', fontSize: 14 },
})
