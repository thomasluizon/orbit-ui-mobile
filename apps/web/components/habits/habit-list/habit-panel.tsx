import type { ReactNode } from 'react'

/** Tonal panel wrapping one top-level habit (single row) or a family (parent
 *  plus inline sub-habits): the quiet `--bg-card` surface with an inset
 *  ghost-edge ring and radius 18 that the frozen habit-list treatment groups
 *  every top-level habit onto. https://github.com/thomasluizon/orbit-ui-mobile/issues/539 */
export function HabitPanel({
  children,
  clip = true,
}: Readonly<{ children: ReactNode; clip?: boolean }>) {
  return (
    <div
      className="relative"
      style={{
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        borderRadius: 18,
        marginLeft: 20,
        marginRight: 20,
        marginBottom: 10,
        ...(clip ? { overflow: 'hidden' } : {}),
      }}
    >
      {children}
    </div>
  )
}
