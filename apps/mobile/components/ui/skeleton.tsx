import { useEffect, useMemo } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the skeleton opacity pulse on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

function usePulseOpacity() {
  const opacity = useMemo(() => new Animated.Value(1), [])
  const prefersReducedMotion = usePrefersReducedMotion()
  useEffect(() => {
    if (prefersReducedMotion) {
      opacity.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity, prefersReducedMotion])
  return opacity
}

function skeletonFillFromFg(fg1Hex: string): string {
  const normalized = fg1Hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, 0.06)`
}

interface SkeletonLineProps {
  width?: DimensionValue
  height?: number
  style?: StyleProp<ViewStyle>
}

/** Loading placeholder line: fg-1 6% tint block with a calm opacity pulse, no gradient shimmer. */
export function SkeletonLine({ width = '100%', height = 12, style }: Readonly<SkeletonLineProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const opacity = usePulseOpacity()
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius.md,
          backgroundColor: skeletonFillFromFg(tokens.fg1),
          opacity,
        },
        style,
      ]}
    />
  )
}

interface SkeletonRowProps {
  /** Shape of the leading placeholder: a round avatar, a rounded icon square, or nothing. */
  media?: 'avatar' | 'square' | 'none'
  /** Width per placeholder line. The first line renders taller, as a title would. */
  lineWidths?: readonly DimensionValue[]
  style?: StyleProp<ViewStyle>
}

const DEFAULT_ROW_LINES: readonly DimensionValue[] = ['35%', '65%']

/**
 * Loading placeholder shaped like a list row: an optional leading avatar or icon square plus
 * title and meta lines, so a list does not shift when its data lands.
 */
export function SkeletonRow({
  media = 'avatar',
  lineWidths = DEFAULT_ROW_LINES,
  style,
}: Readonly<SkeletonRowProps>) {
  return (
    <View style={[styles.row, style]}>
      {media === 'avatar' ? <SkeletonLine width={40} height={40} style={styles.avatar} /> : null}
      {media === 'square' ? <SkeletonLine width={26} height={26} style={styles.square} /> : null}
      <View style={styles.rowLines}>
        {lineWidths.map((width, index) => (
          <SkeletonLine key={index} width={width} height={index === 0 ? 16 : 12} />
        ))}
      </View>
    </View>
  )
}

interface SkeletonCardProps {
  lines?: number
  style?: StyleProp<ViewStyle>
}

function cardLine(index: number, total: number): { width: DimensionValue; height: number } {
  if (index === 0) return { width: '33%', height: 16 }
  if (index === total - 1) return { width: '66%', height: 12 }
  return { width: '100%', height: 12 }
}

/** Loading placeholder shaped like a card: a tonal panel holding a title line and body lines. */
export function SkeletonCard({ lines = 3, style }: Readonly<SkeletonCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
        style,
      ]}
    >
      {Array.from({ length: lines }, (_, index) => {
        const { width, height } = cardLine(index, lines)
        return <SkeletonLine key={index} width={width} height={height} />
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 0,
  },
  avatar: { borderRadius: 20 },
  square: { borderRadius: 8 },
  rowLines: { flex: 1, gap: 8, minWidth: 0 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
})
