'use client'

import { useTranslations } from 'next-intl'
import { Providers } from '@/lib/providers'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const t = useTranslations()

  return (
    <Providers>
      <div className="h-dvh bg-background text-text-primary pt-[var(--safe-top)] flex flex-col ambient-glow">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
        >
          {t('nav.skipToContent')}
        </a>
        <div
          id="main-content"
          className="flex-1 min-h-0 mx-auto w-full max-w-[var(--app-max-w)] px-[var(--app-px)]"
        >
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
