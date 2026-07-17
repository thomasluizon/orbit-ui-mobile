import type { ColorScheme, ColorSchemeDefinition } from './types'

/**
 * The 6 schemes of the navy+violet system. Accents are the frozen literals
 * (#539 b5 de-slop: purple re-anchored to #8659ea); neutralHue/chromaScale drive
 * the shared neutral ramp (see neutral-ramp.ts and the derivation rules in
 * DESIGN.md). `primarySoft` is the accent-text token per mode, L-only-derived to
 * clear the >= 4.5:1 text floor on each scheme canvas (purple/dark frozen to
 * #b69bf8); it equals `primary` where the accent already clears the floor.
 * fgOnPrimary resolves per scheme and mode: white where white passes 4.5:1
 * WCAG AA on the accent, the locked canvas ink #020618 where it fails
 * (see the DESIGN.md hand-tune log).
 */
export const schemes: Record<ColorScheme, ColorSchemeDefinition> = {
  purple: {
    accent: {
      dark: { primary: '#8659ea', primaryPressed: '#6e44d2', primaryRgb: '134, 89, 234' },
      light: { primary: '#631df2', primaryPressed: '#510fd3', primaryRgb: '99, 29, 242' },
    },
    fgOnPrimary: { dark: '#ffffff', light: '#ffffff' },
    primarySoft: { dark: '#b69bf8', light: '#631df2' },
    neutralHue: 270.34980243406005,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  blue: {
    accent: {
      dark: { primary: '#2b7fff', primaryPressed: '#155dfc', primaryRgb: '43, 127, 255' },
      light: { primary: '#155dfc', primaryPressed: '#1447e6', primaryRgb: '21, 93, 252' },
    },
    fgOnPrimary: { dark: '#020618', light: '#ffffff' },
    primarySoft: { dark: '#2b7fff', light: '#155dfc' },
    neutralHue: 233.1502,
    chromaScaleBg: 0.6226,
    chromaScaleFg: 1,
  },
  green: {
    accent: {
      dark: { primary: '#00c950', primaryPressed: '#00a63e', primaryRgb: '0, 201, 80' },
      light: { primary: '#00a63e', primaryPressed: '#008236', primaryRgb: '0, 166, 62' },
    },
    fgOnPrimary: { dark: '#020618', light: '#020618' },
    primarySoft: { dark: '#00c950', light: '#00861b' },
    neutralHue: 140,
    chromaScaleBg: 0.6,
    chromaScaleFg: 0.6,
  },
  rose: {
    accent: {
      dark: { primary: '#ff2056', primaryPressed: '#ec003f', primaryRgb: '255, 32, 86' },
      light: { primary: '#ec003f', primaryPressed: '#c70036', primaryRgb: '236, 0, 63' },
    },
    fgOnPrimary: { dark: '#020618', light: '#ffffff' },
    primarySoft: { dark: '#ff2056', light: '#e6003b' },
    neutralHue: 350.4196,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  orange: {
    accent: {
      dark: { primary: '#ff6900', primaryPressed: '#f54900', primaryRgb: '255, 105, 0' },
      light: { primary: '#f54900', primaryPressed: '#ca3500', primaryRgb: '245, 73, 0' },
    },
    fgOnPrimary: { dark: '#020618', light: '#020618' },
    primarySoft: { dark: '#ff6900', light: '#dc2e00' },
    neutralHue: 32,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  cyan: {
    accent: {
      dark: { primary: '#00b8db', primaryPressed: '#0092b8', primaryRgb: '0, 184, 219' },
      light: { primary: '#0092b8', primaryPressed: '#007595', primaryRgb: '0, 146, 184' },
    },
    fgOnPrimary: { dark: '#020618', light: '#020618' },
    primarySoft: { dark: '#00b8db', light: '#007da2' },
    neutralHue: 191.8735,
    chromaScaleBg: 0.5167,
    chromaScaleFg: 0.843,
  },
}

export const colorSchemeOptions: { value: ColorScheme; color: string }[] = [
  { value: 'purple', color: '#8659ea' },
  { value: 'blue', color: '#2b7fff' },
  { value: 'green', color: '#00c950' },
  { value: 'rose', color: '#ff2056' },
  { value: 'orange', color: '#ff6900' },
  { value: 'cyan', color: '#00b8db' },
]
