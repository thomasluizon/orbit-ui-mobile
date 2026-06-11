import { StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GradientTopProps {
  height?: number
}

/** Kit GradientTop: absolutely positioned gradient-header backdrop pinned to
 *  the top of the screen, behind content and inert to pointers. */
export function GradientTop({ height = 300 }: Readonly<GradientTopProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <LinearGradient
      colors={[tokens.gradientHeaderFrom, tokens.gradientHeaderTo]}
      style={[styles.backdrop, { height }]}
    />
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    pointerEvents: 'none',
  },
})
