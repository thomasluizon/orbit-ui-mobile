import type { AstraGlyphProps } from './AstraGlyph'

const acceptAstraGlyph = (_props: AstraGlyphProps): void => undefined

acceptAstraGlyph({ size: 16, color: 'currentColor' })

// @ts-expect-error Astra has one glyph
acceptAstraGlyph({ variant: 'sparkle' })
// @ts-expect-error Astra has one silhouette
acceptAstraGlyph({ shape: 'circle' })
