'use client'

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

/** Public layout: minimal shell with no bottom nav or app chrome. */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg-1)] pt-[var(--safe-top)]">
      <main className="px-[var(--app-px)]">
        <RouteTransitionShell>
          {children}
        </RouteTransitionShell>
      </main>
    </div>
  )
}
