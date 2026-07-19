interface SatelliteGlyphProps {
  size?: number
}

/** Kit satellite empty-state glyph: a planet ring with a small satellite riding the primary
 *  sweep arc, plus accent star dots. */
export function SatelliteGlyph({ size = 96 }: Readonly<SatelliteGlyphProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="46" cy="48" r="24" stroke="var(--fg-4)" strokeWidth="2.5" />
      <path
        d="M46 24 a24 24 0 0 1 24 24"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="46" cy="48" r="6" fill="var(--fg-3)" />
      <rect
        x="65"
        y="43"
        width="10"
        height="10"
        rx="2.5"
        stroke="var(--primary)"
        strokeWidth="2.5"
      />
      <circle cx="78" cy="20" r="2" fill="var(--primary-soft)" />
      <circle cx="16" cy="72" r="1.6" fill="var(--primary-soft)" />
    </svg>
  )
}
