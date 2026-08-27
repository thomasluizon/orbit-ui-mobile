import type { StatTileProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A fixed-height stat surface whose loading and empty states never reflow the row. */
export function StatTile(props: Readonly<StatTileProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { label, state = 'default' } = props

  return (
    <View
      style={[styles.tile, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
      testID={`stat-tile-${state}`}
      accessibilityRole={state === 'loading' ? 'progressbar' : undefined}
      accessibilityLabel={state === 'loading' ? props.loadingLabel : undefined}
    >
      {state === 'loading' ? (
        <>
          <View style={[styles.valueSkeleton, { backgroundColor: tokens.bgElev2 }]} />
          <View style={[styles.labelSkeleton, { backgroundColor: tokens.bgElev2 }]} />
        </>
      ) : (
        <Text
          style={[
            state === 'empty' ? styles.emptyValue : styles.value,
            { color: state === 'empty' ? tokens.fg4 : tokens.fg1 },
          ]}
        >
          {state === 'empty' ? props.emptyLabel : props.value}
        </Text>
      )}
      <Text
        numberOfLines={2}
        style={[styles.label, { color: state === 'empty' ? tokens.fg3 : tokens.fg2 }]}
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
    minHeight: 132,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  value: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 24,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  emptyValue: {
    fontFamily: 'RobotoMono_500Medium',
    fontSize: 12,
    lineHeight: 24,
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
  labelSkeleton: {
    width: 80,
    height: 20,
    borderRadius: 8,
  },
})
