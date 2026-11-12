import { expect } from 'vitest'

const swapMotion = [
  'transition-[scale,opacity,filter]',
  '[transition-duration:var(--dur-fast)]',
  '[transition-timing-function:var(--ease-standard)]',
  'motion-reduce:transition-none',
  'motion-reduce:scale-100',
  'motion-reduce:blur-[0px]',
]

function glyph(scope: ParentNode, name: 'copy' | 'check'): Element {
  const glyphs = scope.querySelectorAll(`[data-icon-swap="${name}"]`)
  expect(glyphs, `one ${name} glyph from CopyStateIcon`).toHaveLength(1)
  return glyphs[0]!
}

/**
 * Asserts that a copy control renders `CopyStateIcon`: both glyphs stay mounted, the shown glyph is
 * settled, the hidden glyph is faded, scaled to 0.25 and blurred 4px, and both cross-fade on
 * `--dur-fast` with `--ease-standard`. Under reduced motion the swap is instant. A bare ternary fails.
 */
export function expectCopyStateIcon(scope: ParentNode, { copied, strokeWidth, color = 'currentColor' }: Readonly<{ copied: boolean; strokeWidth: number; color?: string }>) {
  const copy = glyph(scope, 'copy')
  const check = glyph(scope, 'check')
  expect(copy).toHaveClass('tabler-icon-copy')
  expect(check).toHaveClass('tabler-icon-check')
  for (const icon of [copy, check]) {
    expect(icon).toHaveClass(...swapMotion)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('stroke-width', String(strokeWidth))
    expect(icon).toHaveAttribute('stroke', color)
  }
  expect(copied ? check : copy).toHaveClass('scale-100', 'opacity-100', 'blur-[0px]')
  expect(copied ? copy : check).toHaveClass('scale-[0.25]', 'opacity-0', 'blur-[4px]')
}
