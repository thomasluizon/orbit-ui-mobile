'use client'

import { Providers } from '@/lib/providers'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { FlowShell } from '@/components/shell/flow-shell'

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Providers>
      <FlowShell mode="full">
        <div className="flex min-h-full flex-col bg-[var(--bg)] pt-[var(--safe-top)] text-[var(--fg-1)]">
          <div className="mx-auto min-h-0 w-full max-w-[var(--app-max-w)] flex-1 px-[var(--app-px)]">
            <RouteTransitionShell className="h-full">
              {children}
            </RouteTransitionShell>
          </div>
          <TourProvider />
          <TourOverlay />
        </div>
      </FlowShell>
    </Providers>
  )
}
