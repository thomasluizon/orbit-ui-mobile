import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { motionDurations, motionEasings, motionLayerTiming, PADDING } from '@orbit/shared/theme'
import type { StatTileProps } from '@orbit/shared/contracts/display'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function shownStatValue(props: StatTileProps): string | number {
  if (props.state === 'empty') return props.emptyLabel
  if (props.state === 'loading') return ''
  return props.value
}

function TileValue({ value, isEmpty, color }: Readonly<{
  value: string | number
  isEmpty: boolean
  color: string
}>) {
  return (
    <Text
      accessibilityLabel={String(value)}
      style={[
        isEmpty ? styles.emptyValue : styles.value,
        { color },
      ]}
    >
      {value}
    </Text>
  )
}

/** A changed figure rolls up into its own line once, inside a clip. Reduced motion keeps it still. */
function RollingValue({ children }: Readonly<{ children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  const [progress] = useState(() => new Animated.Value(reducedMotion ? 1 : 0))
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1)
      return undefined
    }
    const roll = Animated.timing(progress, { toValue: 1, duration: motionDurations.slow, easing: Easing.bezier(...motionEasings.standard), useNativeDriver: true })
    roll.start()
    return () => roll.stop()
  }, [progress, reducedMotion])
  return (
    <View style={styles.rollClip} testID={reducedMotion ? 'stat-tile-value-still' : 'stat-tile-value-roll'}>
      <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0] }) }] }}>{children}</Animated.View>
    </View>
  )
}

export function StatTile(props: Readonly<StatTileProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { label, state = 'default' } = props
  const isEmpty = state === 'empty'

  return (
    <View
      style={[styles.tile, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
      testID={`stat-tile-${state}`}
      accessibilityRole={state === 'loading' ? 'progressbar' : undefined}
      accessibilityLabel={state === 'loading' ? props.loadingLabel : undefined}
    >
      {state === 'loading' ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.loadingValue}>
          <Text style={[styles.value, { opacity: 0 }]}>0</Text><View style={[styles.valueSkeleton, { position: 'absolute', backgroundColor: tokens.bgElev2 }]} />
        </View>
      ) : (
        rollValue(props, <TileValue
          value={shownStatValue(props)}
          isEmpty={isEmpty}
          color={isEmpty ? tokens.fg3 : tokens.fg1}
        />)
      )}
      {state === 'loading' ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.loadingLabel}>
          <Text style={[styles.label, { opacity: 0 }]}>{label}</Text>
          <View style={[styles.labelSkeleton, { backgroundColor: tokens.bgElev2 }]} />
        </View>
      ) : <Text style={[styles.label, { color: isEmpty ? tokens.fg3 : tokens.fg2 }]}>{label}</Text>}
    </View>
  )
}

function rollValue(props: StatTileProps, value: ReactElement) {
  return (props.state === undefined || props.state === 'default') && props.roll ? <RollingValue>{value}</RollingValue> : value
}

const styles = StyleSheet.create({
  rollClip: { maxWidth: '100%', overflow: 'hidden' },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    padding: PADDING.recordInset,
  },
  value: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 22,
    lineHeight: 22 * 1.4,
    textAlign: 'auto',
    fontVariant: ['tabular-nums'],
    maxWidth: '100%',
  },
  emptyValue: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    lineHeight: 22 * 1.4,
    maxWidth: '100%',
  },
  label: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'auto',
  },
  loadingValue: { width: '100%', maxWidth: 64, justifyContent: 'center' },
  loadingLabel: { maxWidth: '100%' },
  labelSkeleton: { position: 'absolute', width: '66%', height: '100%', borderRadius: 8 },
  valueSkeleton: {
    width: '100%',
    height: 22,
    borderRadius: 8,
  },
})
