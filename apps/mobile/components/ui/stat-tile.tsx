import { useState } from 'react'
import type { StatTileProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export const STAT_TILE_MIN_HEIGHT = 132

function shownStatValue(props: StatTileProps): string | number {
  if (props.state === 'empty') return props.emptyLabel
  if (props.state === 'loading') return ''
  return props.value
}

function TileValue({ value, isEmpty, isLargeValue, largeFontSize, color }: Readonly<{
  value: string | number
  isEmpty: boolean
  isLargeValue: boolean
  largeFontSize: number
  color: string
}>) {
  return (
    <Text
      accessibilityLabel={String(value)}
      numberOfLines={1}
      ellipsizeMode={isLargeValue ? undefined : 'tail'}
      style={[
        isEmpty ? styles.emptyValue : styles.value,
        isLargeValue ? [styles.largeValue, { fontSize: largeFontSize }] : undefined,
        { color },
      ]}
    >
      {value}
    </Text>
  )
}

/** A fixed-height stat surface whose loading and empty states never reflow the row. */
export function StatTile(props: Readonly<StatTileProps>) {
  const [tileWidth, setTileWidth] = useState(0)
  const { width } = useWindowDimensions()
  const isNarrowGrid = width >= 344 && width < 412
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { label, state = 'default' } = props
  const isLargeValue = state === 'default' && props.valueSize === 'lg'
  const isEmpty = state === 'empty'

  return (
    <View
      style={[styles.tile, isLargeValue ? styles.largeTile : undefined, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
      testID={`stat-tile-${state}`}
      accessibilityRole={state === 'loading' ? 'progressbar' : undefined}
      accessibilityLabel={state === 'loading' ? props.loadingLabel : undefined}
      onLayout={(event) => setTileWidth(event.nativeEvent.layout.width)}
    >
      {state === 'loading' ? (
        <View style={[styles.valueSkeleton, { backgroundColor: tokens.bgElev2 }]} />
      ) : (
        <TileValue
          value={shownStatValue(props)}
          isEmpty={isEmpty}
          isLargeValue={isLargeValue}
          largeFontSize={!isNarrowGrid && tileWidth >= 172 ? 22 : 17}
          color={isEmpty ? tokens.fg3 : tokens.fg1}
        />
      )}
      <Text
        numberOfLines={2}
        style={[styles.label, { color: isEmpty ? tokens.fg3 : tokens.fg2 }]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: STAT_TILE_MIN_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  largeTile: { paddingVertical: 16 },
  value: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 24,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    maxWidth: '100%',
  },
  largeValue: { textAlign: 'center' },
  emptyValue: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    lineHeight: 24,
    maxWidth: '100%',
  },
  label: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 40,
    textAlign: 'center',
  },
  valueSkeleton: {
    width: 64,
    height: 24,
    borderRadius: 8,
  },
})
