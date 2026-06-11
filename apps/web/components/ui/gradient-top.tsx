interface GradientTopProps {
  height?: number
}

/** Kit GradientTop: absolutely positioned gradient-header backdrop pinned to
 *  the top of the screen, behind content and inert to pointers. Bleeds to the
 *  full viewport width so the fade never cuts at the app column's edges. */
export function GradientTop({ height = 300 }: Readonly<GradientTopProps>) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 z-0 w-screen -translate-x-1/2"
      style={{ height, background: 'var(--gradient-header)' }}
    />
  )
}
