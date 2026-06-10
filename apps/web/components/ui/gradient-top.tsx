interface GradientTopProps {
  height?: number
}

/** Kit GradientTop: absolutely positioned gradient-header backdrop pinned to
 *  the top of the screen, behind content and inert to pointers. */
export function GradientTop({ height = 300 }: Readonly<GradientTopProps>) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0"
      style={{ height, background: 'var(--gradient-header)' }}
    />
  )
}
