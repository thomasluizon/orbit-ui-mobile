'use client'

import { useTranslations } from 'next-intl'
import { Providers } from '@/lib/providers'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { TrialBanner } from '@/components/ui/trial-banner'
import { useUIStore } from '@/stores/ui-store'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations()
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)

  return (
    <Providers>
      <div className="min-h-dvh bg-background text-text-primary pb-28 pt-[var(--safe-top)] ambient-glow">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
        >
          {t('nav.skipToContent')}
        </a>

        {/* Main content - full width mobile, max-w on desktop */}
        <main
          id="main-content"
          className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)]"
        >
          <TrialBanner />
          {children}
        </main>

        {/* Bottom navigation */}
        <BottomNav onCreate={() => setShowCreateModal(true)} />
      </div>
    </Providers>
  )
}
