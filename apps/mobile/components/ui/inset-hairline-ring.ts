import type { ViewStyle } from 'react-native'

/**
 * The 1 dp hairline of a surface, drawn inside its edge so that it takes no layout space.
 * The caller sets `outlineColor`. React Native paints an outline beneath the children of
 * its view, so a surface with a filled child flush with its edge draws this ring on a
 * last, non-interactive overlay child.
 */
export const insetHairlineRing = { outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid' } as const satisfies ViewStyle
