'use client'

import { Providers } from '@/lib/providers'
import { BottomNav } from '@/components/navigation/bottom-nav'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <div className="min-h-dvh bg-background text-text-primary pb-28 pt-[var(--safe-top)] ambient-glow">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
        >
          Skip to content
        </a>

        {/* Main content - full width mobile, max-w on desktop */}
        <main
          id="main-content"
          className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)]"
        >
          {children}
        </main>

        {/* Bottom navigation */}
        <BottomNav />
      </div>
    </Providers>
  )
}
