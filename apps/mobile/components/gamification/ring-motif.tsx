import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface RingMotifProps {
  /** The centered visual anchor (typically the emoji hero disc). */
  anchor: ReactNode
  /** Optional uppercase eyebrow above the anchor. */
  eyebrow?: ReactNode
  /** Override for the eyebrow color (default: fg-3). */
  eyebrowColor?: string
  /** Number of concentric rings (default 3). */
  ringCount?: number
  /** Outermost ring diameter in px (default 280). */
  ringSize?: number
  /** Ring stroke color (default: primary). */
  ringColor?: string
  /** Render rings with a dashed border instead of solid. */
  dashed?: boolean
}

/** Saturn-ring celebration primitive — concentric hairline rings around an anchor. */
export function RingMotif({
  anchor,
  eyebrow,
  eyebrowColor,
  ringCount = 3,
  ringSize = 280,
  ringColor,
  dashed = false,
}: Readonly<RingMotifProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const color = ringColor ?? tokens.primary

  const rings = Array.from({ length: ringCount }).map((_, i) => {
    const size = (ringSize * (i + 1)) / ringCount
    const opacity = i === 0 ? 0.85 : (1 - i / ringCount) * 0.6
    return (
      <View
        key={i}
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: color,
          opacity,
        }}
      />
    )
  })

  return (
    <View style={styles.root}>
      <View style={styles.ringLayer} pointerEvents="none">
        {rings}
      </View>
      {eyebrow ? (
        <Text
          style={[
            styles.eyebrow,
            { color: eyebrowColor ?? tokens.fg3 },
          ]}
        >
          {eyebrow}
        </Text>
      ) : null}
      <View style={styles.anchor}>{anchor}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    position: 'relative',
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
    zIndex: 1,
  },
  anchor: {
    zIndex: 1,
  },
})
