'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '@/stores/auth-store'

const WARN_AT_MINUTES = 5

export function ExpiryWarning() {
  const t = useTranslations()
  const router = useRouter()
  const { expiresAt, logout } = useAuthStore()
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    if (!expiresAt) return

    function check() {
      const now = Date.now()
      const remaining = expiresAt! - now
      const mins = Math.floor(remaining / 60000)

      if (remaining <= 0) {
        setIsExpired(true)
        setMinutesLeft(0)
      } else if (mins <= WARN_AT_MINUTES) {
        setMinutesLeft(mins)
        setIsExpired(false)
      } else {
        setMinutesLeft(null)
        setIsExpired(false)
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const handleLogin = useCallback(() => {
    logout()
    router.push('/login')
  }, [logout, router])

  if (minutesLeft === null && !isExpired) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] mx-auto max-w-[var(--app-max-w)]">
      <div
        className={`mx-4 mt-[calc(var(--safe-top)+0.5rem)] rounded-[var(--radius-lg)] px-4 py-3 flex items-center gap-3 border shadow-[var(--shadow-lg)] backdrop-blur-sm ${
          isExpired
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }`}
      >
        <AlertTriangle className="size-4 shrink-0" />
        <span className="text-sm font-medium flex-1">
          {isExpired
            ? t('auth.sessionExpired')
            : t('auth.sessionExpiring', { minutes: minutesLeft ?? 0 })}
        </span>
        <button
          className="text-xs font-bold shrink-0 hover:underline"
          onClick={handleLogin}
        >
          {isExpired ? t('auth.login') : t('auth.refresh')}
        </button>
      </div>
    </div>
  )
}
