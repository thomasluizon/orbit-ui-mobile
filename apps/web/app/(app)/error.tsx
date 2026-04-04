'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()

  useEffect(() => {
    // Log error for debugging (server-side only via digest)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <AlertTriangle className="size-10 text-text-muted" />
      <p className="text-sm text-text-secondary">
        {error.message || t('auth.genericError')}
      </p>
      <button
        className="px-5 py-2.5 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
        onClick={reset}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
