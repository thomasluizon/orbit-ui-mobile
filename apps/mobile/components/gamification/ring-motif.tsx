import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface RingMotifProps {
  /** The centered visual anchor (typically a number, glyph, or small composition). */
  anchor: ReactNode
  /** Optional italic body line below the anchor. */
  body?: ReactNode
  /** Optional uppercase mono eyebrow above the anchor. */
  eyebrow?: ReactNode
  /** Override for the eyebrow color (default: 70% white). */
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

/** v8 Saturn-ring celebration primitive — concentric hairline rings around an anchor. */
export function RingMotif({
  anchor,
  body,
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

  // Rings are absolutely-positioned circular views centered behind the content.
  // Note: react-native's borderStyle: 'dashed' renders inconsistently across
  // Android API levels; the visual reads as a slightly broken stroke on some
  // devices. We keep the prop because the spec specifies it; consumers should
  // verify on-device before shipping a celebration that relies on it.
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
            { color: eyebrowColor ?? 'rgba(255,255,255,0.7)' },
          ]}
        >
          {eyebrow}
        </Text>
      ) : null}
      <View style={styles.anchor}>{anchor}</View>
      {body ? (
        <Text style={styles.body}>
          {body}
        </Text>
      ) : null}
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
    fontFamily: 'GeistMono',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    zIndex: 1,
  },
  anchor: {
    zIndex: 1,
  },
  body: {
    fontFamily: 'Geist',
    fontSize: 16,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
    zIndex: 1,
  },
})
