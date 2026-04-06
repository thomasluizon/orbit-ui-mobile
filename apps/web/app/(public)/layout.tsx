'use client'

import { useTranslations } from 'next-intl'

/**
 * Public layout: minimal shell with no bottom nav or app chrome.
 * Used for pages accessible without authentication (e.g. privacy policy).
 */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const t = useTranslations()

  return (
    <div className="min-h-dvh bg-background text-text-primary pt-[var(--safe-top)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
      >
        {t('nav.skipToContent')}
      </a>
      <main
        id="main-content"
        className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)]"
      >
        {children}
      </main>
    </div>
  )
}
