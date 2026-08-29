'use client'

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { FlowShell } from '@/components/shell/flow-shell'

/** Public layout: minimal shell with no bottom nav or app chrome. */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <FlowShell>
      <div className="min-h-full bg-[var(--bg)] pt-[var(--safe-top)] text-[var(--fg-1)]">
        <RouteTransitionShell className="px-[var(--app-px)]">
          {children}
        </RouteTransitionShell>
      </div>
    </FlowShell>
  )
}
