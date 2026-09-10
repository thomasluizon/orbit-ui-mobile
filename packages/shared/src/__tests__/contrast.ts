type Rgb = readonly [number, number, number]

function parseColor(color: string): { channels: Rgb; alpha: number } {
  if (/^#[\da-f]{6}$/i.test(color)) {
    return {
      channels: [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ],
      alpha: 1,
    }
  }

  const channels = color.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${color}`)
  return {
    channels: [channels[0]!, channels[1]!, channels[2]!],
    alpha: channels[3] ?? 1,
  }
}

function composite(color: string, background: Rgb): Rgb {
  const { channels, alpha } = parseColor(color)
  return [
    Math.round(channels[0] * alpha + background[0] * (1 - alpha)),
    Math.round(channels[1] * alpha + background[1] * (1 - alpha)),
    Math.round(channels[2] * alpha + background[2] * (1 - alpha)),
  ]
}

function luminance(channels: Rgb): number {
  const linear = channels.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

export function withAlpha(color: string, alpha: number): string {
  const { channels } = parseColor(color)
  return `rgba(${channels.join(',')},${alpha})`
}

export function contrastOnSurface(foreground: string, layers: readonly string[]): number {
  const background = layers.reduce<Rgb>((below, layer) => composite(layer, below), [0, 0, 0])
  const foregroundLuminance = luminance(composite(foreground, background))
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}
