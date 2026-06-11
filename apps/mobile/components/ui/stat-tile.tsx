import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface StatTileProps {
  emoji: string
  value: string | number
  label: string
  /** Render the value as a compact phrase (dates, states) instead of a display numeral. */
  phraseValue?: boolean
  style?: StyleProp<ViewStyle>
}

/** Kit stat tile: emoji over an Inter numeral (or compact Rubik phrase) and a muted Rubik label. */
export function StatTile({
  emoji,
  value,
  label,
  phraseValue = false,
  style,
}: Readonly<StatTileProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
        style,
      ]}
    >
      <Text
        style={styles.emoji}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {emoji}
      </Text>
      <Text
        style={[styles.value, phraseValue && styles.valuePhrase, { color: tokens.fg1 }]}
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  emoji: {
    fontSize: 28,
    lineHeight: 28,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    letterSpacing: -0.24,
  },
  valuePhrase: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
    minHeight: 29,
    textAlignVertical: 'center',
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
  },
})
