import type { ViewStyle } from 'react-native'

/**
 * Resolves the fill styling for a status dot: solid `color` when filled,
 * otherwise a hollow ring in the same color. Pure — mirrors the web
 * status-dot-fill helper.
 */
export function resolveStatusDotFill(
  isFilled: boolean,
  color: string,
): Pick<ViewStyle, 'backgroundColor' | 'borderWidth' | 'borderColor'> {
  return {
    backgroundColor: isFilled ? color : 'transparent',
    borderWidth: isFilled ? 0 : 1.5,
    borderColor: isFilled ? 'transparent' : color,
  }
}
