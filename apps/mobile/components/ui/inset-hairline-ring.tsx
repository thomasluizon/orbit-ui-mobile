import { StyleSheet, View, type ViewStyle } from 'react-native'

/**
 * The 1 dp hairline of a surface, drawn inside its edge so that it takes no layout space.
 * The caller sets `outlineColor`. React Native paints an outline beneath the children of
 * its view, so a surface with a filled child flush with its edge draws the ring with
 * `InsetHairlineRingOverlay`.
 */
export const insetHairlineRing = { outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid' } as const satisfies ViewStyle

/**
 * The inset hairline of a surface that has a filled child flush with its edge. Render it
 * as a child after the fills, so that it paints above them. It takes no pointer input.
 */
export function InsetHairlineRingOverlay({ testID, color, radius }: Readonly<{ testID: string; color: string; radius: number }>) {
  return <View testID={testID} pointerEvents="none" style={[StyleSheet.absoluteFill, insetHairlineRing, { borderRadius: radius, outlineColor: color }]} />
}
