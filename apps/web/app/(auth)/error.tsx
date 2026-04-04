'use client'

import { useTranslations } from 'next-intl'

/**
 * Error boundary for auth pages (login, auth-callback).
 * Matches the Nuxt NuxtErrorBoundary in auth.vue layout.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center gap-4 text-center w-full max-w-sm">
      <svg
        className="size-10 text-text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p className="text-sm text-text-secondary">
        {error.message || t('auth.genericError')}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
