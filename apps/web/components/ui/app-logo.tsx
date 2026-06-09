import Image from 'next/image'

interface AppLogoProps {
  /** Rendered width and height in px. The logo is square. */
  size?: number
}

/** The Orbit logo image. Replaces the procedural Saturn glyph wherever the mark renders. */
export function AppLogo({ size = 32 }: Readonly<AppLogoProps>) {
  return (
    <Image
      src="/logo-no-bg.png"
      alt="Orbit"
      width={size}
      height={size}
      priority
    />
  )
}
