import type { ColorScheme, ColorSchemeDefinition } from './types'

export const schemes: Record<ColorScheme, ColorSchemeDefinition> = {
  purple: {
    primary: '#8b5cf6', primaryLight: '#7c3aed', shadowRgb: '139, 92, 246',
    dark: {
      background: '#07060e', surfaceGround: '#0d0b16', surface: '#13111f',
      surfaceElevated: '#1a1829', surfaceOverlay: '#211f33',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#9b95ad', textMuted: '#7a7490',
      textFaded: '#a59cba', textInverse: '#07060e',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(139, 92, 246, 0.2), 0 0 40px rgba(139, 92, 246, 0.1)',
      shadowGlowSm: '0 0 10px rgba(139, 92, 246, 0.15)',
      shadowGlowLg: '0 0 30px rgba(139, 92, 246, 0.3), 0 0 60px rgba(139, 92, 246, 0.15)',
      navGlassBg: 'rgba(7, 6, 14, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#f8f6ff', surfaceGround: '#f0eef8', surface: '#ffffff',
      surfaceElevated: '#f5f3fb', surfaceOverlay: '#eceaf4',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#1a1625', textSecondary: '#6b6580', textMuted: '#6b6480',
      textFaded: '#7a7490', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.05)',
      shadowGlowSm: '0 0 10px rgba(139, 92, 246, 0.08)',
      shadowGlowLg: '0 0 30px rgba(139, 92, 246, 0.15), 0 0 60px rgba(139, 92, 246, 0.08)',
      navGlassBg: 'rgba(248, 246, 255, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
      400: '#c084fc', 500: '#a855f7', 600: '#8b5cf6', 700: '#7c3aed',
      800: '#6b21a8', 900: '#581c87', 950: '#3b0764'
    }
  },
  blue: {
    primary: '#3b82f6', primaryLight: '#2563eb', shadowRgb: '59, 130, 246',
    dark: {
      background: '#060a10', surfaceGround: '#0a1018', surface: '#101825',
      surfaceElevated: '#162233', surfaceOverlay: '#1c2c42',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#8a9bb5', textMuted: '#6b7d99',
      textFaded: '#8fabc4', textInverse: '#060a10',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(59, 130, 246, 0.2), 0 0 40px rgba(59, 130, 246, 0.1)',
      shadowGlowSm: '0 0 10px rgba(59, 130, 246, 0.15)',
      shadowGlowLg: '0 0 30px rgba(59, 130, 246, 0.3), 0 0 60px rgba(59, 130, 246, 0.15)',
      navGlassBg: 'rgba(6, 10, 16, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#f6f8ff', surfaceGround: '#eef2f8', surface: '#ffffff',
      surfaceElevated: '#f3f6fc', surfaceOverlay: '#e8edf6',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#151a25', textSecondary: '#5c6b82', textMuted: '#5c6b82',
      textFaded: '#6b7d99', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(59, 130, 246, 0.1), 0 0 40px rgba(59, 130, 246, 0.05)',
      shadowGlowSm: '0 0 10px rgba(59, 130, 246, 0.08)',
      shadowGlowLg: '0 0 30px rgba(59, 130, 246, 0.15), 0 0 60px rgba(59, 130, 246, 0.08)',
      navGlassBg: 'rgba(246, 248, 255, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
      400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
      800: '#1e40af', 900: '#1e3a8a', 950: '#172554'
    }
  },
  green: {
    primary: '#22c55e', primaryLight: '#16a34a', shadowRgb: '34, 197, 94',
    dark: {
      background: '#060e0a', surfaceGround: '#0a160f', surface: '#101f17',
      surfaceElevated: '#162b20', surfaceOverlay: '#1c3829',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#8aab9a', textMuted: '#6b8d7c',
      textFaded: '#8cb5a0', textInverse: '#060e0a',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(34, 197, 94, 0.2), 0 0 40px rgba(34, 197, 94, 0.1)',
      shadowGlowSm: '0 0 10px rgba(34, 197, 94, 0.15)',
      shadowGlowLg: '0 0 30px rgba(34, 197, 94, 0.3), 0 0 60px rgba(34, 197, 94, 0.15)',
      navGlassBg: 'rgba(6, 14, 10, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#f5fcf8', surfaceGround: '#eef7f2', surface: '#ffffff',
      surfaceElevated: '#f2f9f5', surfaceOverlay: '#e6f3ec',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#152018', textSecondary: '#5c7d6a', textMuted: '#4d6b58',
      textFaded: '#6b8d7c', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(34, 197, 94, 0.1), 0 0 40px rgba(34, 197, 94, 0.05)',
      shadowGlowSm: '0 0 10px rgba(34, 197, 94, 0.08)',
      shadowGlowLg: '0 0 30px rgba(34, 197, 94, 0.15), 0 0 60px rgba(34, 197, 94, 0.08)',
      navGlassBg: 'rgba(245, 252, 248, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
      400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
      800: '#166534', 900: '#14532d', 950: '#052e16'
    }
  },
  rose: {
    primary: '#f43f5e', primaryLight: '#e11d48', shadowRgb: '244, 63, 94',
    dark: {
      background: '#0e0608', surfaceGround: '#16090d', surface: '#1f1014',
      surfaceElevated: '#29171d', surfaceOverlay: '#351e26',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#b595a2', textMuted: '#997a88',
      textFaded: '#c49aaa', textInverse: '#0e0608',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(244, 63, 94, 0.2), 0 0 40px rgba(244, 63, 94, 0.1)',
      shadowGlowSm: '0 0 10px rgba(244, 63, 94, 0.15)',
      shadowGlowLg: '0 0 30px rgba(244, 63, 94, 0.3), 0 0 60px rgba(244, 63, 94, 0.15)',
      navGlassBg: 'rgba(14, 6, 8, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#fef6f7', surfaceGround: '#f8eef0', surface: '#ffffff',
      surfaceElevated: '#fbf3f5', surfaceOverlay: '#f3e6ea',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#201518', textSecondary: '#7d5c66', textMuted: '#7d5c66',
      textFaded: '#997a88', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(244, 63, 94, 0.1), 0 0 40px rgba(244, 63, 94, 0.05)',
      shadowGlowSm: '0 0 10px rgba(244, 63, 94, 0.08)',
      shadowGlowLg: '0 0 30px rgba(244, 63, 94, 0.15), 0 0 60px rgba(244, 63, 94, 0.08)',
      navGlassBg: 'rgba(254, 246, 247, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af',
      400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
      800: '#9f1239', 900: '#881337', 950: '#4c0519'
    }
  },
  orange: {
    primary: '#f97316', primaryLight: '#ea580c', shadowRgb: '249, 115, 22',
    dark: {
      background: '#0e0906', surfaceGround: '#160f0a', surface: '#1f1610',
      surfaceElevated: '#291e16', surfaceOverlay: '#35261c',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#b5a08a', textMuted: '#998570',
      textFaded: '#c4a88c', textInverse: '#0e0906',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(249, 115, 22, 0.2), 0 0 40px rgba(249, 115, 22, 0.1)',
      shadowGlowSm: '0 0 10px rgba(249, 115, 22, 0.15)',
      shadowGlowLg: '0 0 30px rgba(249, 115, 22, 0.3), 0 0 60px rgba(249, 115, 22, 0.15)',
      navGlassBg: 'rgba(14, 9, 6, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#fef8f5', surfaceGround: '#f8f0ec', surface: '#ffffff',
      surfaceElevated: '#fbf5f1', surfaceOverlay: '#f3e9e2',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#201810', textSecondary: '#7d6b58', textMuted: '#6b5b48',
      textFaded: '#998570', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(249, 115, 22, 0.1), 0 0 40px rgba(249, 115, 22, 0.05)',
      shadowGlowSm: '0 0 10px rgba(249, 115, 22, 0.08)',
      shadowGlowLg: '0 0 30px rgba(249, 115, 22, 0.15), 0 0 60px rgba(249, 115, 22, 0.08)',
      navGlassBg: 'rgba(254, 248, 245, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74',
      400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c',
      800: '#9a3412', 900: '#7c2d12', 950: '#431407'
    }
  },
  cyan: {
    primary: '#06b6d4', primaryLight: '#0891b2', shadowRgb: '6, 182, 212',
    dark: {
      background: '#060c0e', surfaceGround: '#0a1416', surface: '#101e22',
      surfaceElevated: '#16282e', surfaceOverlay: '#1c343b',
      border: 'rgba(255, 255, 255, 0.07)', borderMuted: 'rgba(255, 255, 255, 0.04)',
      borderEmphasis: 'rgba(255, 255, 255, 0.12)',
      textPrimary: '#f0eef6', textSecondary: '#8aacb5', textMuted: '#6b8e99',
      textFaded: '#8cb8c4', textInverse: '#060c0e',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowGlow: '0 0 20px rgba(6, 182, 212, 0.2), 0 0 40px rgba(6, 182, 212, 0.1)',
      shadowGlowSm: '0 0 10px rgba(6, 182, 212, 0.15)',
      shadowGlowLg: '0 0 30px rgba(6, 182, 212, 0.3), 0 0 60px rgba(6, 182, 212, 0.15)',
      navGlassBg: 'rgba(6, 12, 14, 0.45)', navGlassBorder: 'rgba(255, 255, 255, 0.06)'
    },
    light: {
      background: '#f5fbfd', surfaceGround: '#eef6f8', surface: '#ffffff',
      surfaceElevated: '#f2f9fb', surfaceOverlay: '#e6f2f5',
      border: 'rgba(0, 0, 0, 0.08)', borderMuted: 'rgba(0, 0, 0, 0.04)',
      borderEmphasis: 'rgba(0, 0, 0, 0.12)',
      textPrimary: '#151e20', textSecondary: '#5c7d85', textMuted: '#4d6b72',
      textFaded: '#6b8e99', textInverse: '#f0eef6',
      shadowSm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
      shadowLg: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      shadowGlow: '0 0 20px rgba(6, 182, 212, 0.1), 0 0 40px rgba(6, 182, 212, 0.05)',
      shadowGlowSm: '0 0 10px rgba(6, 182, 212, 0.08)',
      shadowGlowLg: '0 0 30px rgba(6, 182, 212, 0.15), 0 0 60px rgba(6, 182, 212, 0.08)',
      navGlassBg: 'rgba(245, 251, 253, 0.65)', navGlassBorder: 'rgba(0, 0, 0, 0.06)'
    },
    scale: {
      50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9',
      400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490',
      800: '#155e75', 900: '#164e63', 950: '#083344'
    }
  }
}

export const colorSchemeOptions: { value: ColorScheme; color: string }[] = [
  { value: 'purple', color: '#8b5cf6' },
  { value: 'blue', color: '#3b82f6' },
  { value: 'green', color: '#22c55e' },
  { value: 'rose', color: '#f43f5e' },
  { value: 'orange', color: '#f97316' },
  { value: 'cyan', color: '#06b6d4' }
]
