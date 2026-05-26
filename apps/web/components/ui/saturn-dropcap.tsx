/** Saturn glyph: outlined planet + tilted ring. Inherits color from currentColor. */
interface SaturnDropcapProps {
  size?: number
  strokeWidth?: number
}

export function SaturnDropcap({ size = 32, strokeWidth = 1.4 }: Readonly<SaturnDropcapProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10.5"
        ry="3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        transform="rotate(-22 12 12)"
      />
    </svg>
  )
}
