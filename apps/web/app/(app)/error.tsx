'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center justify-center py-16 px-9 gap-4 text-center">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'var(--bg-field)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <AlertTriangle size={34} strokeWidth={1.8} className="text-[var(--fg-3)]" />
      </div>
      <p className="t-h2">
        {process.env.NODE_ENV === 'development' ? error.message : t('auth.genericError')}
      </p>
      <PillButton onClick={reset} className="mt-1.5">
        {t('common.retry')}
      </PillButton>
    </div>
  )
}
