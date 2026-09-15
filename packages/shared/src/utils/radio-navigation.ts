export type RadioNavigationKey =
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'End'
  | 'Home'

export function getRadioNavigationIndex(
  key: string,
  currentIndex: number,
  optionCount: number,
): number | null {
  if (optionCount < 1) return null
  if (key === 'Home') return 0
  if (key === 'End') return optionCount - 1
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return (currentIndex + 1) % optionCount
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return (currentIndex - 1 + optionCount) % optionCount
  }
  return null
}
