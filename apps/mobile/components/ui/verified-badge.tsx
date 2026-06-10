import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface VerifiedBadgeProps {
  size?: number
}

/** Kit verified badge: scalloped check on a circular primary-tinted disc. */
export function VerifiedBadge({ size = 96 }: Readonly<VerifiedBadgeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, backgroundColor: tintFromPrimary(tokens, 0.15) },
      ]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 1.5l2.3 1.7 2.8-.4 1.2 2.6 2.6 1.2-.4 2.8L22 12l-1.7 2.3.4 2.8-2.6 1.2-1.2 2.6-2.8-.4L12 22.5l-2.3-1.7-2.8.4-1.2-2.6-2.6-1.2.4-2.8L2 12l1.7-2.3-.4-2.8 2.6-1.2L7.1 3.1l2.8.4z"
          stroke={tokens.primary}
          strokeWidth={1.6}
          strokeLinejoin="round"
          fill={tintFromPrimary(tokens, 0.12)}
        />
        <Path
          d="M8.5 12.2l2.4 2.3 4.6-4.8"
          stroke={tokens.primary}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
})
