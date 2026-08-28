import { useEffect, useMemo } from 'react'
import type { SkeletonProps } from '@orbit/shared/contracts/feedback'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated already drives this single opacity pulse on the UI thread; the existing Reanimated migration remains device-gated https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  StyleSheet,
  View,
} from 'react-native'
import { createTokensV2, radius, type AppTokensV2 } from '@/lib/theme'
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

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity, prefersReducedMotion])

  return opacity
}

function Block({ style, tokens, opacity }: Readonly<{ style: object; tokens: AppTokensV2; opacity: Animated.Value }>) {
  return <Animated.View style={[styles.block, { backgroundColor: tokens.bgWell, opacity }, style]} />
}

function HabitRowSkeleton({ tokens, opacity }: Readonly<{ tokens: AppTokensV2; opacity: Animated.Value }>) {
  return (
    <View style={[styles.habitRow, { backgroundColor: tokens.bgCard }]}>
      <Block style={styles.habitEmoji} tokens={tokens} opacity={opacity} />
      <View style={styles.copy}>
        <Block style={styles.habitTitle} tokens={tokens} opacity={opacity} />
        <Block style={styles.habitMeta} tokens={tokens} opacity={opacity} />
      </View>
      <Block style={styles.habitStatus} tokens={tokens} opacity={opacity} />
    </View>
  )
}

function SettingsSkeleton({ tokens, opacity }: Readonly<{ tokens: AppTokensV2; opacity: Animated.Value }>) {
  return (
    <View style={styles.settingsRow}>
      <Block style={styles.settingsIcon} tokens={tokens} opacity={opacity} />
      <View style={styles.copy}>
        <Block style={styles.settingsTitle} tokens={tokens} opacity={opacity} />
        <Block style={styles.settingsMeta} tokens={tokens} opacity={opacity} />
      </View>
      <Block style={styles.settingsValue} tokens={tokens} opacity={opacity} />
    </View>
  )
}

function StatTileSkeleton({ tokens, opacity }: Readonly<{ tokens: AppTokensV2; opacity: Animated.Value }>) {
  return (
    <View style={[styles.statTile, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Block style={styles.statValue} tokens={tokens} opacity={opacity} />
      <Block style={styles.statLabel} tokens={tokens} opacity={opacity} />
    </View>
  )
}

function GridSkeleton({ props, tokens, opacity }: Readonly<{
  props: Extract<SkeletonProps, { variant: 'grid' }>
  tokens: AppTokensV2
  opacity: Animated.Value
}>) {
  return (
    <View
      style={[
        styles.grid,
        {
          gap: props.gap,
          width: props.cols * props.cell + (props.cols - 1) * props.gap,
          height: props.rows * props.cell + (props.rows - 1) * props.gap,
        },
      ]}
      testID="skeleton-grid-shape"
    >
      {Array.from({ length: props.rows * props.cols }, (_, index) => (
        <Block
          key={index}
          style={{ width: props.cell, height: props.cell }}
          tokens={tokens}
          opacity={opacity}
        />
      ))}
    </View>
  )
}

/** One accessible placeholder unit shaped like the content that replaces it. */
export function Skeleton(props: Readonly<SkeletonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const opacity = usePulseOpacity()

  return (
    <View
      accessible
      accessibilityLabel={props.label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={styles.unit}
      testID={`skeleton-unit-${props.variant}`}
    >
      {props.variant === 'habit-row' ? <HabitRowSkeleton tokens={tokens} opacity={opacity} /> : null}
      {props.variant === 'settings' ? <SettingsSkeleton tokens={tokens} opacity={opacity} /> : null}
      {props.variant === 'stat-tile' ? <StatTileSkeleton tokens={tokens} opacity={opacity} /> : null}
      {props.variant === 'grid' ? <GridSkeleton props={props} tokens={tokens} opacity={opacity} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  unit: { width: '100%' },
  block: { borderRadius: radius.md },
  copy: { flex: 1, gap: 8 },
  habitRow: {
    height: 68,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitEmoji: { width: 46, height: 46 },
  habitTitle: { width: '66%', height: 16 },
  habitMeta: { width: '33%', height: 12 },
  habitStatus: { width: 30, height: 30, borderRadius: radius.full },
  settingsRow: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIcon: { width: 24, height: 24 },
  settingsTitle: { width: '50%', height: 16 },
  settingsMeta: { width: '66%', height: 12 },
  settingsValue: { width: 48, height: 16 },
  statTile: {
    minHeight: 110,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  statValue: { width: '50%', height: 24 },
  statLabel: { width: '66%', height: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
})
