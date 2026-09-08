import type { AstraGlyphProps } from './AstraGlyph'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type AstraGlyphTypeContract = [
  Assert<IsExactWidth<AstraGlyphProps['size'], number | undefined>>,
  Assert<IsExactWidth<AstraGlyphProps['color'], string | undefined>>,
  Assert<IsExact<{ size: 16; color: 'currentColor' }, AstraGlyphProps>>,
  // @ts-expect-error Astra has one glyph
  Assert<IsExact<{ variant: 'sparkle' }, AstraGlyphProps>>,
  // @ts-expect-error Astra has one silhouette
  Assert<IsExact<{ shape: 'circle' }, AstraGlyphProps>>,
]
