'use client'

import { useTranslations } from 'next-intl'

/**
 * Auth layout: centered layout with branding for login and auth-callback pages.
 * No bottom navigation or app chrome.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const t = useTranslations()

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 pt-[var(--safe-top)] ambient-glow">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
      >
        {t('nav.skipToContent')}
      </a>
      <div className="text-center mb-8 animate-slide-up">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img
            src="/logo-no-bg.png"
            alt="Orbit"
            className="size-12 drop-shadow-[0_0_12px_rgba(var(--primary-shadow),0.3)]"
            width={48}
            height={48}
          />
          <h1 className="text-[length:var(--text-fluid-xl)] font-extrabold text-text-primary tracking-tight">
            Orbit
          </h1>
        </div>
        <p className="text-text-muted text-sm">{t('auth.tagline')}</p>
      </div>
      <div id="main-content">
        {children}
      </div>
    </div>
  )
}
