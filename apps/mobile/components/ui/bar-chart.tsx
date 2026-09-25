import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { GestureResponderEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import {
  BAR_CHART_HEIGHT,
  barChartPath,
  nearestBarIndex,
  resolveBarChartGeometry,
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
  const [selected, setSelected] = useState(points.length - 1)
  const bars = resolveBarChartGeometry(points.map((point) => point.rate), width)
  if (points.length === 0) return null
  const point = points[Math.max(0, Math.min(selected, points.length - 1))]!
  const readout = point.scheduled === 0
    ? `${point.dateLabel}: ${t('charts.bar.nothingScheduled')}`
    : `${point.dateLabel}: ${t('charts.bar.readout', { done: point.completed, scheduled: point.scheduled })}`

  function selectAt(event: GestureResponderEvent) {
    setSelected(nearestBarIndex(event.nativeEvent.locationX, bars))
  }

  return (
    <View style={styles.container} testID="bar-chart">
      <Text accessibilityLiveRegion="polite" style={[styles.readout, { color: tokens.fg2 }]}>{readout}</Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: points.length, now: selected + 1, text: readout }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => setSelected((current) => stepSelection(current, points.length, event.nativeEvent.actionName === 'increment' ? 'right' : 'left'))}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={selectAt}
        onResponderMove={selectAt}
        style={styles.plot}
        testID="bar-chart-control"
      >
        <Svg accessible={false} width="100%" height={BAR_CHART_HEIGHT} viewBox={`0 0 ${width || 1} ${BAR_CHART_HEIGHT}`}>
          {bars.map((bar, index) => {
            const empty = points[index]!.rate == null || points[index]!.rate === 0
            return <Path key={index} d={barChartPath(bar)} fill={empty ? tokens.trackEmpty : index === selected ? tokens.fg1 : tokens.fg2} />
          })}
        </Svg>
      </View>
      <View style={styles.axis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.axisLabel, { color: tokens.fg3 }]}>{points[0]!.dateLabel}</Text>
        <Text style={[styles.axisLabel, { color: tokens.fg3 }]}>{points.at(-1)?.dateLabel}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 8 },
  readout: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  plot: { height: BAR_CHART_HEIGHT, width: '100%' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
})
