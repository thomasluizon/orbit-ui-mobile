import { expect } from 'vitest'
import { Check, Copy } from '@/components/ui/icons'

interface IconNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: IconNode) => boolean): IconNode[]
}

const swapTransition = 'opacity 160ms cubic-bezier(0.2,0,0,1), transform 160ms cubic-bezier(0.2,0,0,1), filter 160ms cubic-bezier(0.2,0,0,1)'

function flatten(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style ?? {}) as Record<string, unknown>
}

function glyph(root: unknown, name: 'copy' | 'check', expected: Readonly<{ color: string; strokeWidth: number }>): Record<string, unknown> {
  const hosts = (root as IconNode).findAll((node) => typeof node.type === 'string' && node.props.testID === `${name}-icon`)
  expect(hosts, `one ${name} glyph from CopyStateIcon`).toHaveLength(1)
  const icons = hosts[0]!.findAll((node) => node.type === (name === 'copy' ? Copy : Check))
  expect(icons).toHaveLength(1)
  expect(icons[0]!.props).toMatchObject({ accessible: false, size: 20, ...expected })
  return flatten(hosts[0]!.props.style)
}

/**
 * Asserts that a copy control renders `CopyStateIcon`: both glyphs stay mounted, the shown glyph is
 * settled, the hidden glyph is faded, scaled to 0.25 and blurred 4, and both cross-fade on
 * `motionDurations.fast` with the standard curve. Under reduced motion the swap is instant. A bare ternary fails.
 */
export function expectCopyStateIcon(root: unknown, { copied, reducedMotion, color, strokeWidth }: Readonly<{ copied: boolean; reducedMotion: boolean; color: string; strokeWidth: number }>) {
  const shown = glyph(root, copied ? 'check' : 'copy', { color, strokeWidth })
  const hidden = glyph(root, copied ? 'copy' : 'check', { color, strokeWidth })
  expect(shown).toMatchObject({ opacity: 1, transform: [{ scale: 1 }], filter: [{ blur: 0 }] })
  expect(hidden).toMatchObject({ opacity: 0, transform: [{ scale: reducedMotion ? 1 : 0.25 }], filter: [{ blur: reducedMotion ? 0 : 4 }] })
  for (const style of [shown, hidden]) expect(style.transition).toBe(reducedMotion ? 'none' : swapTransition)
}
