'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
      const remaining = (expiresAt ?? 0) - now
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
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed left-0 right-0 z-[9998] mx-auto"
      style={{ top: 0, maxWidth: 'var(--app-max-w)' }}
    >
      <div
        className="flex items-center"
        style={{
          padding: '8px 14px',
          marginTop: 'calc(var(--safe-top) + 0.25rem)',
          background: 'var(--bg-elev)',
          borderTop: '1px solid var(--hairline)',
          borderBottom: '1px solid var(--hairline)',
          gap: 12,
        }}
      >
        <span
          className="flex-1"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--fg-2)',
          }}
        >
          {isExpired ? (
            <span style={{ color: 'var(--status-overdue)', fontStyle: 'italic' }}>
              {t('auth.sessionExpired')}
            </span>
          ) : (
            <>
              {t('auth.sessionExpiringPrefix')}{' '}
              <span
                style={{
                  color: 'var(--fg-1)',
                  fontFamily: 'var(--font-family-mono)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('auth.minutesShort', { minutes: minutesLeft ?? 0 })}
              </span>
            </>
          )}
        </span>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer transition-opacity duration-150 ease-out hover:opacity-80"
          onClick={handleLogin}
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--fg-1)',
            padding: 4,
          }}
        >
          {isExpired ? t('auth.login') : t('auth.refresh')}
        </button>
      </div>
    </div>
  )
}
