import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface InfoRowProps {
  /** Mono caption (e.g. "2 of 6 · 33%"). */
  label?: string
  /** Render the label in mono with tabular nums (default true). */
  mono?: boolean
  /** Optional progress 0..1 — renders a hairline bar below the label. */
  progress?: number
}

/**
 * v8 InfoRow: 1-line stat strip used directly below the AppBar.
 * Optional progress bar renders as a 3px hairline track with primary fill.
 */
export function InfoRow({
  label,
  mono = true,
  progress,
}: Readonly<InfoRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const clampedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: tokens.hairline,
        },
      ]}
    >
      {label ? (
        <Text
          style={[
            mono ? styles.labelMono : styles.label,
            { color: tokens.fg3 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
      {clampedProgress !== null ? (
        <View
          style={[styles.track, { backgroundColor: tokens.bgSunk }]}
        >
          <View
            style={{
              width: `${Math.round(clampedProgress * 100)}%`,
              height: '100%',
              backgroundColor: tokens.primary,
              borderRadius: 999,
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
  },
  labelMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  track: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
})
