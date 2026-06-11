'use client'

import { useTranslations } from 'next-intl'
import { TriangleAlert } from 'lucide-react'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'

/**
 * Error boundary for auth pages (login, auth-callback).
 * Matches the Nuxt NuxtErrorBoundary in auth.vue layout.
 */
export default function AuthError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex w-full max-w-sm flex-col items-center" style={{ gap: 20 }}>
      <InfoCard
        icon={TriangleAlert}
        title={process.env.NODE_ENV === 'development' ? error.message : t('auth.genericError')}
      />
      <PillButton onClick={reset}>{t('common.retry')}</PillButton>
    </div>
  )
}
