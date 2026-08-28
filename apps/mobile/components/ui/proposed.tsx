import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'
import { Children, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Shared purple ramp: #f8fafc over #020618 matches #90a1b9 luminance at 0.629 opacity;
 * light #0f172b over #f8fafc matches #62748e at 0.595. */
const PROPOSED_OPACITY = {
  dark: 0.63,
  light: 0.6,
} as const

function renderNativeChild(child: ReactNode): ReactNode {
  if (typeof child === 'string' || typeof child === 'number') return <Text>{child}</Text>
  return child
}

export function Proposed({ proposed, scope, label, children }: Readonly<ProposedProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  if (!proposed) return children

  return (
    <View
      accessible={false}
      style={{
        borderColor: tokens.hairlineStrong,
        borderRadius: PROPOSED_RADIUS[scope],
        borderStyle: 'dashed',
        borderWidth: 1,
      }}
      testID={`proposed-${scope}`}
    >
      <Text
        accessible
        accessibilityLabel={label}
        style={styles.accessibilityLabel}
        testID={`proposed-${scope}-label`}
      >
        {label}
      </Text>
      <View
        style={{ opacity: PROPOSED_OPACITY[currentTheme] }}
        testID={`proposed-${scope}-content`}
      >
        {Children.map(children, renderNativeChild)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  accessibilityLabel: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
})
