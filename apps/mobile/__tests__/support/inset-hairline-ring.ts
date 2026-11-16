import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { expect } from 'vitest'
import { insetHairlineRing } from '@/components/ui/inset-hairline-ring'

/** Asserts that a surface draws its hairline inside its edge, as the web inset ring does, so that the hairline takes no layout space. */
export function expectInsetHairlineRing(style: StyleProp<ViewStyle>, outlineColor: string) {
  const flattened = StyleSheet.flatten(style)
  expect(flattened.borderWidth, 'the hairline takes no layout space').toBeUndefined()
  expect(flattened).toMatchObject({ ...insetHairlineRing, outlineColor })
}
