import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type Tokens = ReturnType<typeof createTokensV2>

function DayCellContents({ props, outcome, size, tokens }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; tokens: Tokens }>) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = props.scheduled && props.done !== undefined ? Math.max(0, Math.min(1, props.done / props.scheduled)) : 0.5
  const fill = outcome === 'full'
    ? tokens.fg1
    : outcome === 'not-scheduled' || outcome === 'unavailable'
      ? tokens.bgWell
      : 'transparent'
  const borderColor = outcome === 'future' ? tokens.hairlineStrong : outcome === 'none' ? tokens.fg4 : 'transparent'
  const textColor = outcome === 'full' ? tokens.bg : tokens.fg2

  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderColor, borderWidth: borderColor === 'transparent' ? 0 : outcome === 'future' ? 1 : 2 }]}>
      {outcome === 'partial' ? (
        <Svg width={size} height={size} style={styles.arc}>
          <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tokens.fg4} strokeWidth={stroke} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tokens.primary}
            strokeDasharray={[circumference * fraction, circumference]}
            strokeLinecap="round"
            strokeWidth={stroke}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
      ) : null}
      <Text style={[styles.numeral, { color: textColor, fontWeight: props.today ? '500' : '400' }]}>{props.day}</Text>
    </View>
  )
}

function HabitHistoryContents({ props, outcome, size, tokens }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; tokens: Tokens }>) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled' || outcome === 'unavailable'
  let textColor = tokens.fg2
  if (outcome === 'full') textColor = tokens.bg
  else if (outcome === 'future') textColor = tokens.fg4
  else if (missed) textColor = tokens.fg3
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: outcome === 'full' ? tokens.fg1 : 'transparent', opacity: dimmed ? 0.4 : 1 }]}>
      <Text style={[styles.numeral, { color: textColor, fontWeight: props.today ? '500' : '400' }]}>{props.day}</Text>
      {missed ? <View style={[styles.missedDot, { backgroundColor: tokens.fg4 }]} /> : null}
    </View>
  )
}

export function DayCell(props: Readonly<DayCellProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? 44
  const containerStyle = [
    styles.container,
    { width: size, height: size, borderRadius: size / 2 },
    props.selected ? { backgroundColor: tokens.selectionBg } : null,
    props.selected || props.today ? { borderColor: tokens.primary, borderWidth: 2 } : null,
    props.outsideMonth ? styles.outsideMonth : null,
  ]
  const state = { selected: Boolean(props.selected), disabled: !props.loggable }
  const testID = `day-cell-${outcome}${props.outsideMonth ? '-outside-month' : ''}`

  if (props.loggable && !props.outsideMonth) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={buildDayCellAccessibleName(props, outcome)}
        accessibilityState={state}
        onPress={props.onPress}
        testID={testID}
        style={({ pressed }) => [containerStyle, pressed ? { backgroundColor: tokens.bgElev } : null]}
      >
        {props.habitHistory ? <HabitHistoryContents props={props} outcome={outcome} size={size} tokens={tokens} /> : <DayCellContents props={props} outcome={outcome} size={size} tokens={tokens} />}
      </Pressable>
    )
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={props.outsideMonth ? undefined : buildDayCellAccessibleName(props, outcome)}
      accessibilityState={state}
      accessibilityElementsHidden={props.outsideMonth}
      importantForAccessibility={props.outsideMonth ? 'no-hide-descendants' : 'auto'}
      testID={testID}
      style={containerStyle}
    >
      {props.habitHistory ? <HabitHistoryContents props={props} outcome={outcome} size={size} tokens={tokens} /> : <DayCellContents props={props} outcome={outcome} size={size} tokens={tokens} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center' },
  arc: { position: 'absolute', top: 0, left: 0 },
  numeral: { fontFamily: 'Roboto_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  outsideMonth: { opacity: 0 },
  missedDot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, bottom: 4 },
})
