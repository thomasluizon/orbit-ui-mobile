import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'
import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, type StyleProp, type TextStyle, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type ProposedChildProps = Readonly<{
  children?: ReactNode
  style?: StyleProp<TextStyle>
}>

function tintChild(child: ReactNode, color: string): ReactNode {
  if (typeof child === 'string' || typeof child === 'number') {
    return <Text style={{ color }}>{child}</Text>
  }
  if (!isValidElement<ProposedChildProps>(child)) return child

  /** Explicit color wins. Composite components own their colors and fall through unchanged. */
  if (child.type === Text || child.type === TextInput) {
    if (StyleSheet.flatten(child.props.style ?? {}).color != null) return child
    return cloneElement(child, { style: [child.props.style, { color }] })
  }

  if (child.type === Fragment || child.type === View || child.type === Pressable) {
    const children = Children.map(child.props.children, (nestedChild) => tintChild(nestedChild, color))
    return cloneElement(child, { children })
  }
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
