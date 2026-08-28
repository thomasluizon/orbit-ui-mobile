import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'
import { cloneElement, isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function tintChild(child: ReactNode, color: string): ReactNode {
  if (!isValidElement<{ style?: unknown }>(child)) return child
  return cloneElement(child, { style: [child.props.style, { color }] })
}

export function Proposed({ proposed, scope, label, children }: Readonly<ProposedProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  if (!proposed) return children

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        borderColor: tokens.hairlineStrong,
        borderRadius: PROPOSED_RADIUS[scope],
        borderStyle: 'dashed',
        borderWidth: 1,
      }}
      testID={`proposed-${scope}`}
    >
      {tintChild(children, tokens.fg3)}
    </View>
  )
}
