import Svg, { Circle, Ellipse } from 'react-native-svg'

interface SaturnDropcapProps {
  size?: number
  strokeWidth?: number
  /** Override the stroke color. Defaults to `currentColor` semantics via `color`. */
  color?: string
}

/** v8 Saturn glyph: outlined planet + tilted ring. */
export function SaturnDropcap({
  size = 32,
  strokeWidth = 1.4,
  color = '#fff',
}: Readonly<SaturnDropcapProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Ellipse
        cx="12"
        cy="12"
        rx="10.5"
        ry="3"
        stroke={color}
        strokeWidth={strokeWidth}
        transform="rotate(-22 12 12)"
      />
    </Svg>
  )
}
