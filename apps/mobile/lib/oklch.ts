// OKLCH → sRGB hex conversion for React Native (no native oklch() support).
// Matches W3C CSS Color 4 spec; precomputed once per scheme-switch, results cached.

function srgbCompand(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function channelToHex(c: number): string {
  const clamped = Math.max(0, Math.min(1, c))
  const byte = Math.round(clamped * 255)
  return byte.toString(16).padStart(2, '0')
}

export function oklchToHex(
  lightness: number,
  chroma: number,
  hueDegrees: number,
): string {
  const hueRad = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hueRad)
  const b = chroma * Math.sin(hueRad)

  const lLin = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mLin = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sLin = lightness - 0.0894841775 * a - 1.2914855480 * b

  const l = lLin * lLin * lLin
  const m = mLin * mLin * mLin
  const s = sLin * sLin * sLin

  const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  const r = srgbCompand(rLinear)
  const g = srgbCompand(gLinear)
  const bb = srgbCompand(bLinear)

  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(bb)}`
}

export function oklchToRgba(
  lightness: number,
  chroma: number,
  hueDegrees: number,
  alpha: number,
): string {
  const hueRad = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hueRad)
  const b = chroma * Math.sin(hueRad)

  const lLin = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mLin = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sLin = lightness - 0.0894841775 * a - 1.2914855480 * b

  const l = lLin * lLin * lLin
  const m = mLin * mLin * mLin
  const s = sLin * sLin * sLin

  const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  const r = Math.round(Math.max(0, Math.min(1, srgbCompand(rLinear))) * 255)
  const g = Math.round(Math.max(0, Math.min(1, srgbCompand(gLinear))) * 255)
  const bb = Math.round(Math.max(0, Math.min(1, srgbCompand(bLinear))) * 255)

  return `rgba(${r}, ${g}, ${bb}, ${alpha})`
}
