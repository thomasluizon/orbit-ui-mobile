'use client'

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { FlowShell } from '@/components/shell/flow-shell'
import { usePathname } from 'next/navigation'

/** Public layout: minimal shell with no bottom nav or app chrome. */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const legalDocument = pathname === '/privacy' || pathname === '/terms'

  return (
    <FlowShell mode={legalDocument ? 'document' : 'card'}>
      <div className="min-h-full bg-[var(--bg)] pt-[var(--safe-top)] text-[var(--fg-1)]">
        <RouteTransitionShell className={legalDocument ? undefined : 'px-[var(--app-px)]'}>
          {children}
        </RouteTransitionShell>
      </div>
    </FlowShell>
  )
}
