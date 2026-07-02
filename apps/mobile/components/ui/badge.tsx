import type { ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import {
  createTokensV2,
  radius,
  tintFromPrimary,
  type AppTokensV2,
} from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type BadgeTone = 'violet' | 'soft' | 'outline' | 'amber' | 'bad'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function toneStyles(
  tone: BadgeTone,
  tokens: AppTokensV2,
): { container: ViewStyle; text: TextStyle } {
  if (tone === 'soft') {
    return {
      container: { backgroundColor: tintFromPrimary(tokens, 0.18) },
      text: { color: tokens.primarySoft },
    }
  }
  if (tone === 'outline') {
    return {
      container: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: tokens.hairlineStrong,
      },
      text: { color: tokens.fg2 },
    }
  }
  if (tone === 'amber') {
    return {
      container: { backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.18) },
      text: { color: tokens.statusOverdueText },
    }
  }
  if (tone === 'bad') {
    return {
      container: { backgroundColor: rgbaFromHex(tokens.statusBad, 0.18) },
      text: { color: tokens.statusBadText },
    }
  }
  return {
    container: { backgroundColor: tokens.primary },
    text: { color: tokens.fgOnPrimary },
  }
}

/** Kit badge: 10.5/600 uppercase pill in violet, soft, outline, amber, or bad tone. */
export function Badge({ tone = 'violet', children, style }: Readonly<BadgeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const toned = toneStyles(tone, tokens)

  return (
    <View style={[styles.badge, toned.container, style]}>
      <Text style={[styles.text, toned.text]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  text: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.63,
    textTransform: 'uppercase',
  },
})
