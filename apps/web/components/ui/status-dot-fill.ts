import type { CSSProperties } from 'react'

/**
 * Resolves the fill styling for a status dot: solid `color` when filled,
 * otherwise a hollow inset ring in the same color. Pure — shared by the
 * read-only and interactive render branches.
 */
export function resolveStatusDotFill(
  isFilled: boolean,
  color: string,
): Pick<CSSProperties, 'background' | 'boxShadow'> {
  return {
    background: isFilled ? color : 'transparent',
    boxShadow: isFilled ? 'none' : `inset 0 0 0 1.5px ${color}`,
  }
}
