import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'
import { Pressable, StyleSheet, Text, View, type AccessibilityState } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type Tokens = ReturnType<typeof createTokensV2>

type ContentsProps = Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; tokens: Tokens; pressed: boolean }>

/** The translucent hover layer covers the round hit area below the day's foreground. */
function PressFill({ size, tokens }: Readonly<{ size: number; tokens: Tokens }>) {
  return <View pointerEvents="none" testID="day-press-fill" style={[styles.pressFill, { borderRadius: size / 2, backgroundColor: tokens.bgHover }]} />
}

function DayCellContents({ props, outcome, size, tokens, pressed }: ContentsProps) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = props.scheduled && props.done !== undefined ? Math.max(0, Math.min(1, props.done / props.scheduled)) : 0.5
  const fill = outcome === 'full' ? tokens.fg1 : 'transparent'
  const borderColor = outcome === 'none' ? tokens.statusEmpty : 'transparent'
  const textColor = outcome === 'full' ? tokens.bg : tokens.fg2

  return (
    <View testID="day-disc" style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderColor, borderWidth: borderColor === 'transparent' ? 0 : 2 }]}>
      {pressed && outcome === 'full' ? <PressFill size={size} tokens={tokens} /> : null}
      {outcome === 'partial' ? (
        <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} style={styles.arc}>
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

function HabitHistoryContents({ props, outcome, size, tokens, pressed }: ContentsProps) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled'
  let textColor = tokens.fg2
  if (outcome === 'full') textColor = tokens.bg
  else if (missed) textColor = tokens.fg2
  return (
    <View testID="day-disc" style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: outcome === 'full' ? tokens.fg1 : 'transparent', opacity: dimmed ? 0.4 : 1 }]}>
      {pressed && outcome === 'full' ? <PressFill size={size} tokens={tokens} /> : null}
      <Text style={[styles.numeral, { color: textColor, fontWeight: props.today ? '500' : '400' }]}>{props.day}</Text>
      {missed ? <View style={[styles.missedDot, { backgroundColor: tokens.statusEmpty }]} /> : null}
    </View>
  )
}

type MobileDayCellProps = DayCellProps & {
  accessibilityState?: AccessibilityState
}

function DayCellCircle({ props, size, tokens, pressed, focused }: Readonly<{ props: DayCellProps; size: number; tokens: Tokens; pressed: boolean; focused: boolean }>) {
  const outcome = resolveDayCellOutcome(props)
  const contents = props.future
    ? <Text testID="day-future-numeral" style={[styles.numeral, { color: tokens.fg2 }]}>{props.day}</Text>
    : props.habitHistory
      ? <HabitHistoryContents props={props} outcome={outcome} size={34} tokens={tokens} pressed={pressed} />
      : <DayCellContents props={props} outcome={outcome} size={34} tokens={tokens} pressed={pressed} />
  const ring = props.today || props.selected || focused || props.focused
    ? <View pointerEvents="none" testID={props.today ? 'day-today-ring' : 'day-selection-ring'} style={[styles.pressFill, { borderRadius: size / 2, borderColor: tokens.primary, borderWidth: 2 }]} />
    : null
  return <View style={{ width: '100%', maxWidth: size }}><View testID="day-circle" style={[styles.container, { width: '100%', aspectRatio: 1, borderRadius: size / 2, overflow: 'hidden', backgroundColor: props.selected ? tokens.selectionBg : props.loggable || props.raised ? tokens.bgWell : 'transparent' }]}>
    {pressed ? <PressFill size={size} tokens={tokens} /> : null}
    {contents}
    {ring}
  </View></View>
}

export function DayCell(props: Readonly<MobileDayCellProps>) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? MONTH_GRID_TARGET_MIN
  const interactive = Boolean(props.loggable) && !props.outsideMonth
  const containerStyle = [styles.container, { width: '100%' as const, minHeight: Math.max(size, MONTH_GRID_TARGET_MIN) }, props.outsideMonth ? styles.outsideMonth : null]
  const state = { ...props.accessibilityState, selected: props.selected, disabled: !props.loggable }
  const testID = `day-cell-${outcome}${props.outsideMonth ? '-outside-month' : ''}`
  const isPressed = pressed || Boolean(props.pressed)
  const circle = <DayCellCircle props={props} size={size} tokens={tokens} pressed={isPressed} focused={focused} />

  if (interactive) {
    return <Pressable accessibilityRole="button" accessibilityLabel={buildDayCellAccessibleName(props, outcome)} accessibilityState={state}
      onPress={props.onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      testID={testID} style={containerStyle}>{circle}</Pressable>
  }
  return <View accessibilityRole="image" accessibilityLabel={props.outsideMonth ? undefined : buildDayCellAccessibleName(props, outcome)} accessibilityState={state}
    accessibilityElementsHidden={props.outsideMonth} importantForAccessibility={props.outsideMonth ? 'no-hide-descendants' : 'auto'} testID={testID} style={containerStyle}>{circle}</View>
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
