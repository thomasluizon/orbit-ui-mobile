import { useMemo, useRef, useState, type Ref } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, LinearTransition } from 'react-native-reanimated'
import type { PressableProps } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path } from 'react-native-svg'
import type { BarChartPoint, BarGeometry } from '@orbit/shared/contracts/display'
import {
  BAR_CHART_HEIGHT,
  barChartPath,
  resolveBarChartGeometry,
  resolveBarChartReadout,
  resolveBarChartSelection,
  stepSelection,
} from '@orbit/shared/contracts/display'
import { motionEasings, motionPresets } from '@orbit/shared/theme'
import { useTranslation } from 'react-i18next'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const READOUT_MOVE = LinearTransition.duration(motionPresets.selection.enterDuration).easing(Easing.bezier(...motionEasings.standard))

function BarChartColumn({ left, width, bar, selected, tokens, columnRef, ...targetProps }: Readonly<{
  left: number
  width: number
  bar?: BarGeometry
  selected: boolean
  tokens: AppTokensV2
  columnRef: Ref<View>
} & Pick<PressableProps, 'accessibilityLabel' | 'accessibilityState' | 'onAccessibilityAction' | 'onPress' | 'onFocus' | 'onBlur'>>) {
  const [hovered, setHovered] = useState(false)
  const hoverGesture = useMemo(() => Gesture.Hover()
    .manualActivation(true)
    .cancelsTouchesInView(false)
    .runOnJS(true)
    .onBegin(() => setHovered(true))
    .onFinalize(() => setHovered(false)), [])

  return (
    <GestureDetector gesture={hoverGesture}>
      <Pressable
        ref={columnRef}
        {...targetProps}
        accessible
        accessibilityRole="radio"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        style={[styles.target, { left, width }]}
      >
        {({ pressed }) => bar ? <>
          <View testID="bar-chart-fill" pointerEvents="none" accessible={false} style={[styles.feedback, { left: bar.x - left, top: bar.y, width: bar.width, height: bar.height, backgroundColor: 'transparent' }]}>
            <Svg accessible={false} width="100%" height="100%" viewBox={`${bar.x} ${bar.y} ${bar.width} ${bar.height}`}>
              <Path d={barChartPath(bar)} fill={selected || pressed || hovered ? tokens.fg1 : tokens.fg2} />
            </Svg>
          </View>
        </> : null}
      </Pressable>
    </GestureDetector>
  )
}

/** `onSelectPoint` reports each selection the person makes, by press, focus or accessibility action, with the bar that holds it. */
export function BarChart({ points, label, onSelectPoint }: Readonly<{
  points: readonly BarChartPoint[]
  label: string
  onSelectPoint?: (point: BarChartPoint, bar: View | null) => void
}>) {
  const { t } = useTranslation()
  const reducedMotion = usePrefersReducedMotion()
  const columnRefs = useRef<(View | null)[]>([])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [width, setWidth] = useState(0)
  const [readoutWidth, setReadoutWidth] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const selectedIndex = resolveBarChartSelection(points, selectedDate)
  const bars = resolveBarChartGeometry(points.map((point) => point.rate), width)

  function select(index: number) {
    const point = points[index]!
    setSelectedDate(point.startDate)
    onSelectPoint?.(point, columnRefs.current[index] ?? null)
  }

  function describePoint(point: BarChartPoint) {
    return point.scheduled === 0
      ? t('charts.bar.unscheduledDay', { date: point.readoutDateLabel })
      : t('charts.bar.selectedDay', { date: point.readoutDateLabel, rate: point.rate ?? 0, done: point.completed, scheduled: point.scheduled })
  }

  if (points.length === 0) return null
  return (
    <View style={styles.container} testID="bar-chart">
      <Animated.Text testID="bar-chart-readout" layout={reducedMotion ? undefined : READOUT_MOVE} accessibilityLiveRegion="polite" onLayout={(event) => setReadoutWidth(event.nativeEvent.layout.width)} style={[styles.readout, { color: tokens.fg1, left: resolveBarChartReadout(width, readoutWidth, selectedIndex, points.length) }, focused === null ? null : { borderColor: tokens.fg1 }]}>
        {describePoint(points[selectedIndex]!)}
      </Animated.Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.plot} testID="bar-chart-control">
        {points.map((point, index) => <BarChartColumn
          key={point.startDate}
          left={index * width / points.length}
          width={width / points.length}
          bar={bars[index]}
          selected={index === selectedIndex}
          tokens={tokens}
          columnRef={(element) => { columnRefs.current[index] = element }}
          accessibilityLabel={describePoint(point)}
          accessibilityState={{ checked: index === selectedIndex }}
          onAccessibilityAction={(event) => {
            const direction = event.nativeEvent.actionName === 'increment' ? 'right' : 'left'
            select(stepSelection(selectedIndex, points.length, direction))
          }}
          onPress={() => select(index)}
          onFocus={() => { setFocused(index); select(index) }}
          onBlur={() => setFocused(null)}
        />)}
      </View>
      <View style={styles.axis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.axisLabel, { color: tokens.fg3 }]}>{points[0]!.dateLabel}</Text>
        <Text style={[styles.axisLabel, { color: tokens.fg3, textAlign: 'right' }]}>{points.at(-1)?.dateLabel}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 8 },
  readout: { alignSelf: 'flex-start', maxWidth: '100%', padding: 8, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  plot: { height: BAR_CHART_HEIGHT, width: '100%' },
  feedback: { position: 'absolute' },
  target: { position: 'absolute', top: 0, height: BAR_CHART_HEIGHT },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
})
