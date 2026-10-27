import {
  ASTRA_GLYPH_VIEW_BOX,
  ASTRA_GLYPH_PATHS,
  type AstraGlyphProps,
} from '@orbit/shared/contracts/brand'

export function AstraGlyph({ size = 24, color }: Readonly<AstraGlyphProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={ASTRA_GLYPH_VIEW_BOX}
      fill="none"
      color={color ?? 'currentColor'}
      aria-hidden="true"
      data-asset="astra-mark"
    >
      {ASTRA_GLYPH_PATHS.map((path) => (
        <path
          key={path.d}
          d={path.d}
          fill="currentColor"
          fillRule={path.fillRule}
          clipRule={path.fillRule}
        />
      ))}
    </svg>
  )
}
