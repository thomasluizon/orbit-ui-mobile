'use client'

import { Providers } from '@/lib/providers'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Providers>
      <div className="h-dvh bg-[var(--bg)] text-[var(--fg-1)] pt-[var(--safe-top)] flex flex-col">
        <div className="flex-1 min-h-0 mx-auto w-full max-w-[var(--app-max-w)] px-[var(--app-px)]">
          <RouteTransitionShell className="h-full">
            {children}
          </RouteTransitionShell>
        </div>
        <TourProvider />
        <TourOverlay />
      </div>
    </Providers>
  )
}
