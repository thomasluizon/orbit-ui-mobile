export function steadyColumnInset({ viewport, column, block }: Readonly<{ viewport: number; column: number; block: number }>): number {
  return Math.min(block, Math.max(0, (viewport - column + block) / 2))
}
