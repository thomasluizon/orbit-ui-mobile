import {
  ASTRA_GLYPH_16_PATHS,
  ASTRA_GLYPH_PATHS,
  type AstraGlyphProps,
} from '@orbit/shared/contracts/brand'

export function AstraGlyph({ size = 24, color }: Readonly<AstraGlyphProps>) {
  const isNativeSize = size < 20
  const paths = isNativeSize ? ASTRA_GLYPH_16_PATHS : ASTRA_GLYPH_PATHS

  return (
    <svg
      width={size}
      height={size}
      viewBox={isNativeSize ? '0 0 16 16' : '0 0 1024 1024'}
      fill="none"
      color={color ?? 'currentColor'}
      aria-hidden="true"
      data-asset={isNativeSize ? 'astra-mark-16' : 'astra-mark'}
    >
      {paths.map((path) => (
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
