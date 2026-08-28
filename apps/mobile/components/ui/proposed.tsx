import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'
import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type ProposedChildProps = Readonly<{
  children?: ReactNode
  style?: unknown
}>

function tintChild(child: ReactNode, color: string): ReactNode {
  if (!isValidElement<ProposedChildProps>(child)) return child

  const children = Children.map(child.props.children, (nestedChild) => tintChild(nestedChild, color))
  if (child.type === Fragment) return cloneElement(child, { children })
  if (child.type !== Text && child.type !== TextInput) return cloneElement(child, { children })

  return cloneElement(child, { children, style: [child.props.style, { color }] })
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
      {Children.map(children, (child) => tintChild(child, tokens.fg3))}
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
