import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface InfoRowProps {
  /** Caption line (Rubik 14 fg-3; Roboto tabular meta when `mono`). */
  label?: string
  /** Render the label in mono with tabular nums (default true). */
  mono?: boolean
  /** Optional value line under the label (Rubik 16 fg-1). */
  value?: string
  /** Optional progress 0..1 — renders a hairline bar below the text. */
  progress?: number
}

/**
 * Kit ListRow-language info strip: label over optional value, used directly
 * below the AppBar and for key/value rows. Optional 3px progress bar.
 */
export function InfoRow({
  label,
  mono = true,
  value,
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
      {value ? (
        <Text
          style={[styles.value, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {value}
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
    fontSize: 14,
  },
  labelMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.24,
  },
  value: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
  },
  track: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
})
