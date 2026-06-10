interface SatelliteGlyphProps {
  size?: number
}

/** Kit satellite empty-state glyph: muted orbiter with a primary arc and accent star dots. */
export function SatelliteGlyph({ size = 96 }: Readonly<SatelliteGlyphProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="34" cy="34" r="19" stroke="var(--fg-4)" strokeWidth="2.5" />
      <path
        d="M34 21 a13 13 0 0 1 13 13"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="34" cy="34" r="5" fill="var(--fg-3)" />
      <rect
        x="52"
        y="52"
        width="22"
        height="13"
        rx="2.5"
        transform="rotate(45 63 58)"
        stroke="var(--fg-4)"
        strokeWidth="2.5"
      />
      <path d="M63 70 L63 84" stroke="var(--fg-4)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M56 84 L70 84" stroke="var(--fg-4)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="74" cy="22" r="2" fill="var(--primary-soft)" />
      <circle cx="20" cy="68" r="1.6" fill="var(--primary-soft)" />
    </svg>
  )
}
