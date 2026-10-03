import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'
import { Pressable, StyleSheet, Text, View, type AccessibilityState } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type Tokens = ReturnType<typeof createTokensV2>

type ContentsProps = Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; tokens: Tokens }>

/** The hover token is a translucent overlay, so it layers over the day's own fill rather than replacing it. */
function PressFill({ size, tokens }: Readonly<{ size: number; tokens: Tokens }>) {
  return <View pointerEvents="none" testID="day-press-fill" style={[styles.pressFill, { borderRadius: size / 2, backgroundColor: tokens.bgHover }]} />
}

function DayCellContents({ props, outcome, size, tokens }: ContentsProps) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = props.scheduled && props.done !== undefined ? Math.max(0, Math.min(1, props.done / props.scheduled)) : 0.5
  const fill = outcome === 'full' ? tokens.fg1 : 'transparent'
  const borderColor = outcome === 'none' ? tokens.statusEmpty : 'transparent'
  const textColor = outcome === 'full' ? tokens.bg : tokens.fg2

  return (
    <View testID="day-disc" style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderColor, borderWidth: borderColor === 'transparent' ? 0 : 2 }]}>
      {outcome === 'partial' ? (
        <Svg width={size} height={size} style={styles.arc}>
          <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tokens.statusEmpty} strokeWidth={stroke} />
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

function HabitHistoryContents({ props, outcome, size, tokens }: ContentsProps) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled'
  let textColor = tokens.fg2
  if (outcome === 'full') textColor = tokens.bg
  else if (missed) textColor = tokens.fg3
  return (
    <View testID="day-disc" style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: outcome === 'full' ? tokens.fg1 : 'transparent', opacity: dimmed ? 0.4 : 1 }]}>
      <Text style={[styles.numeral, { color: textColor, fontWeight: props.today ? '500' : '400' }]}>{props.day}</Text>
      {missed ? <View style={[styles.missedDot, { backgroundColor: tokens.statusEmpty }]} /> : null}
    </View>
  )
}

type MobileDayCellProps = DayCellProps & {
  accessibilityState?: AccessibilityState
}

export function DayCell(props: Readonly<MobileDayCellProps>) {
  const [pressed, setPressed] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? MONTH_GRID_TARGET_MIN
  const interactive = Boolean(props.loggable) && !props.outsideMonth
  const containerStyle = [
    styles.container,
    { width: props.size ?? '100%' as const, minHeight: size, borderRadius: size / 2, overflow: 'hidden' as const },
    props.outsideMonth ? styles.outsideMonth : null,
  ]
  const state = { ...props.accessibilityState, disabled: !props.loggable }
  const testID = `day-cell-${outcome}${props.outsideMonth ? '-outside-month' : ''}`
  const contents = props.habitHistory
    ? <HabitHistoryContents props={props} outcome={outcome} size={size} tokens={tokens} />
    : <DayCellContents props={props} outcome={outcome} size={size} tokens={tokens} />
  const todayRing = props.today
    ? <View pointerEvents="none" testID="day-today-ring" style={[styles.pressFill, { borderRadius: size / 2, borderColor: tokens.primary, borderWidth: 2 }]} />
    : null

  if (interactive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={buildDayCellAccessibleName(props, outcome)}
        accessibilityState={state}
        onPress={props.onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        testID={testID}
        style={containerStyle}
      >
        {contents}
        {todayRing}
        {pressed ? <PressFill size={size} tokens={tokens} /> : null}
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
      {contents}
      {todayRing}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  pressFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  disc: { alignItems: 'center', justifyContent: 'center' },
  arc: { position: 'absolute', top: 0, left: 0 },
  numeral: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  outsideMonth: { opacity: 0 },
  missedDot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, bottom: 4 },
})
