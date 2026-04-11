import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Check } from 'lucide-react-native'

interface ProgressRingProps {
  progress: number // 0..1
  size?: number
  strokeWidth?: number
  color: string
  trackColor?: string
  done?: boolean
  children?: ReactNode
}

const VIEWBOX_SIZE = 36
const RADIUS = 15
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressRing({
  progress,
  size = 36,
  strokeWidth = 3,
  color,
  trackColor = 'rgba(255,255,255,0.08)',
  done = false,
  children,
}: Readonly<ProgressRingProps>) {
  const clamped = Math.max(0, Math.min(1, progress))
  const dashLength = done ? CIRCUMFERENCE : clamped * CIRCUMFERENCE
  const dashArray = `${dashLength} ${CIRCUMFERENCE}`

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        style={styles.svg}
      >
        <Circle
          cx={VIEWBOX_SIZE / 2}
          cy={VIEWBOX_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={VIEWBOX_SIZE / 2}
          cy={VIEWBOX_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          transform={`rotate(-90 ${VIEWBOX_SIZE / 2} ${VIEWBOX_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {done ? <Check size={14} color={color} strokeWidth={3} /> : children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
