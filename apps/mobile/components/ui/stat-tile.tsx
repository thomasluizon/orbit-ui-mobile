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

/**
 * Kit stat tile: emoji over a single-line Inter numeral (or compact Rubik phrase) and a muted
 * Rubik label clamped to two lines inside a fixed 40px reservation, so side-by-side tiles keep a
 * shared baseline when a longer pt-BR label wraps.
 */
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
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
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
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: tokens.fg2 }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 20,
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
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    alignSelf: 'stretch',
    minHeight: 29,
  },
  valuePhrase: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 15,
    letterSpacing: 0,
    textAlignVertical: 'center',
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
})
