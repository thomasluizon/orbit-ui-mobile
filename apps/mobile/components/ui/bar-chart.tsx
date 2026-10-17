import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import {
  BAR_CHART_HEIGHT,
  barChartPath,
  resolveBarChartGeometry,
  resolveBarChartReadout,
  resolveBarChartSelection,
  stepSelection,
} from '@orbit/shared/contracts/display'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BarChart({ points, label }: Readonly<{ points: readonly BarChartPoint[]; label: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [width, setWidth] = useState(0)
  const [readoutWidth, setReadoutWidth] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const selectedIndex = resolveBarChartSelection(points, selectedDate)
  const bars = resolveBarChartGeometry(points.map((point) => point.rate), width)

  function describePoint(point: BarChartPoint) {
    return point.scheduled === 0
      ? t('charts.bar.unscheduledDay', { date: point.readoutDateLabel })
      : t('charts.bar.selectedDay', { date: point.readoutDateLabel, rate: point.rate ?? 0, done: point.completed, scheduled: point.scheduled })
  }

  if (points.length === 0) return null
  return (
    <View style={styles.container} testID="bar-chart">
      <Text testID="bar-chart-readout" accessibilityLiveRegion="polite" onLayout={(event) => setReadoutWidth(event.nativeEvent.layout.width)} style={[styles.readout, { color: tokens.fg1, left: resolveBarChartReadout(width, readoutWidth, selectedIndex, points.length) }]}>
        {describePoint(points[selectedIndex]!)}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.plot} testID="bar-chart-control">
        {points.map((point, index) => <Pressable
          key={point.startDate}
          accessible
          accessibilityRole="radio"
          accessibilityLabel={describePoint(point)}
          accessibilityState={{ checked: index === selectedIndex }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const direction = event.nativeEvent.actionName === 'increment' ? 'right' : 'left'
            setSelectedDate(points[stepSelection(index, points.length, direction)]!.startDate)
          }}
          onPress={() => setSelectedDate(point.startDate)}
          onFocus={() => { setFocused(index); setSelectedDate(point.startDate) }}
          onBlur={() => setFocused(null)}
          onHoverIn={() => setHovered(index)}
          onHoverOut={() => setHovered(null)}
          style={[styles.target, { left: index * width / points.length, width: width / points.length }]}
        >
          {({ pressed }) => <>
            <View pointerEvents="none" accessible={false} style={[styles.feedback, { backgroundColor: pressed || hovered === index ? tokens.bgHover : 'transparent' }]} />
            {focused === index ? <View pointerEvents="none" accessible={false} style={[styles.focusRing, { borderColor: tokens.fg1 }]} /> : null}
          </>}
        </Pressable>)}
        <Svg style={styles.paint} accessible={false} pointerEvents="none" width="100%" height={BAR_CHART_HEIGHT} viewBox={`0 0 ${width || 1} ${BAR_CHART_HEIGHT}`}>
          {bars.map((bar, index) => <Path key={points[index]!.startDate} d={barChartPath(bar)} fill={index === selectedIndex ? tokens.fg1 : tokens.fg2} />)}
        </Svg>
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
  readout: { alignSelf: 'flex-start', maxWidth: '100%', fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  plot: { height: BAR_CHART_HEIGHT, width: '100%' },
  feedback: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 8, overflow: 'hidden' },
  paint: { position: 'absolute', top: 0, left: 0 },
  target: { position: 'absolute', top: 0, height: BAR_CHART_HEIGHT },
  focusRing: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
})
