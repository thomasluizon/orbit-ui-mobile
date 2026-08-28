import {
  PROPOSED_RADIUS,
  type ProposedProps,
} from '@orbit/shared/contracts/blocks'
import { tintProposedChildren, type ProposedTintAdapter } from '@orbit/shared/utils'
import { cloneElement, Fragment } from 'react'
import { Pressable, StyleSheet, Text, TextInput, type StyleProp, type TextStyle, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function createTintAdapter(color: string): ProposedTintAdapter {
  return {
    wrapText(child) {
      return <Text style={{ color }}>{child}</Text>
    },
    visitElement(child) {
      if (child.type === Fragment) return { kind: 'recurse' }
      if (child.type !== Text && child.type !== TextInput && child.type !== View && child.type !== Pressable) {
        return { kind: 'keep' }
      }
      const style = child.props.style as StyleProp<TextStyle>
      const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined
      if (flattenedStyle?.color != null) return { kind: 'keep' }
      if (child.type === Text || child.type === TextInput) {
        return {
          kind: 'replace',
          child: cloneElement(child, { style: [style, { color }] }),
        }
      }
      return { kind: 'recurse' }
    },
  }
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
      {tintProposedChildren(children, createTintAdapter(tokens.fg3))}
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
