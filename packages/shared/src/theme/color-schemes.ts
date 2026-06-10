import type { ColorScheme, ColorSchemeDefinition } from './types'

/**
 * The 6 schemes of the navy+violet system. Accents are the handoff literals;
 * neutralHue/chromaScale drive the shared neutral ramp (see neutral-ramp.ts
 * and the derivation rules in DESIGN.md). Gradient stops are precomputed from
 * the accent hue at the handoff stops' locked OKLCH lightness/chroma.
 */
export const schemes: Record<ColorScheme, ColorSchemeDefinition> = {
  purple: {
    accent: {
      dark: { primary: '#7f46f7', primaryPressed: '#631df2', primaryRgb: '127, 70, 247' },
      light: { primary: '#631df2', primaryPressed: '#510fd3', primaryRgb: '99, 29, 242' },
    },
    neutralHue: 265.1322,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
    gradientHeaderFrom: { dark: '#22094f', light: '#e9d4ff' },
  },
  blue: {
    accent: {
      dark: { primary: '#2b7fff', primaryPressed: '#155dfc', primaryRgb: '43, 127, 255' },
      light: { primary: '#155dfc', primaryPressed: '#1447e6', primaryRgb: '21, 93, 252' },
    },
    neutralHue: 233.1502,
    chromaScaleBg: 0.6226,
    chromaScaleFg: 1,
    gradientHeaderFrom: { dark: '#001b48', light: '#cedfff' },
  },
  green: {
    accent: {
      dark: { primary: '#00c950', primaryPressed: '#00a63e', primaryRgb: '0, 201, 80' },
      light: { primary: '#00a63e', primaryPressed: '#008236', primaryRgb: '0, 166, 62' },
    },
    neutralHue: 140,
    chromaScaleBg: 0.6,
    chromaScaleFg: 0.6,
    gradientHeaderFrom: { dark: '#012709', light: '#c4eac7' },
  },
  rose: {
    accent: {
      dark: { primary: '#ff2056', primaryPressed: '#ec003f', primaryRgb: '255, 32, 86' },
      light: { primary: '#ec003f', primaryPressed: '#c70036', primaryRgb: '236, 0, 63' },
    },
    neutralHue: 350.4196,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
    gradientHeaderFrom: { dark: '#40010e', light: '#ffd1d0' },
  },
  orange: {
    accent: {
      dark: { primary: '#ff6900', primaryPressed: '#f54900', primaryRgb: '255, 105, 0' },
      light: { primary: '#f54900', primaryPressed: '#ca3500', primaryRgb: '245, 73, 0' },
    },
    neutralHue: 32,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
    gradientHeaderFrom: { dark: '#371100', light: '#ffd3c6' },
  },
  cyan: {
    accent: {
      dark: { primary: '#00b8db', primaryPressed: '#0092b8', primaryRgb: '0, 184, 219' },
      light: { primary: '#0092b8', primaryPressed: '#007595', primaryRgb: '0, 146, 184' },
    },
    neutralHue: 191.8735,
    chromaScaleBg: 0.5167,
    chromaScaleFg: 0.843,
    gradientHeaderFrom: { dark: '#01232b', light: '#b2e8fd' },
  },
}

export const colorSchemeOptions: { value: ColorScheme; color: string }[] = [
  { value: 'purple', color: '#7f46f7' },
  { value: 'blue', color: '#2b7fff' },
  { value: 'green', color: '#00c950' },
  { value: 'rose', color: '#ff2056' },
  { value: 'orange', color: '#ff6900' },
  { value: 'cyan', color: '#00b8db' },
]
