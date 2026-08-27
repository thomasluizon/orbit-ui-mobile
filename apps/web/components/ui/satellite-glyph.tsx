import { OrbitMark } from '@/components/ui/orbit-mark'

interface SatelliteGlyphProps {
  size?: number
}

/** @deprecated Use OrbitMark directly. */
export function SatelliteGlyph({ size = 96 }: Readonly<SatelliteGlyphProps>) {
  return <OrbitMark size={size} />
}
