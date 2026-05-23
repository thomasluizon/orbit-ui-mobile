'use client'

import { useTranslations } from 'next-intl'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

/**
 * Auth layout: centered v8 shell for login and auth-callback pages.
 * Card chrome lives in the page; layout owns the surrounding viewport and skip link.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const t = useTranslations()

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        padding: '24px 16px',
        paddingTop: 'calc(24px + var(--safe-top))',
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999]"
        style={{
          padding: '8px 14px',
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          borderRadius: 8,
        }}
      >
        {t('nav.skipToContent')}
      </a>
      <RouteTransitionShell className="w-full flex justify-center">
        <div id="main-content">{children}</div>
      </RouteTransitionShell>
    </div>
  )
}
