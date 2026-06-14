'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '@/stores/auth-store'

const WARN_AT_MINUTES = 5

export function ExpiryWarning() {
  const t = useTranslations()
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
    void logout()
  }, [logout])

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
        className="flex items-center rounded-[14px]"
        style={{
          padding: '10px 14px',
          margin: 'calc(var(--safe-top) + 0.25rem) 10px 0',
          gap: 12,
          background: 'color-mix(in srgb, var(--status-overdue) 10%, var(--bg))',
          boxShadow:
            'inset 0 0 0 1px color-mix(in srgb, var(--status-overdue) 28%, transparent), var(--shadow-2)',
        }}
      >
        <span
          className="flex-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-2)',
          }}
        >
          {isExpired ? (
            <span style={{ color: 'var(--status-overdue-text)' }}>
              {t('auth.sessionExpired')}
            </span>
          ) : (
            <>
              {t('auth.sessionExpiringPrefix')}{' '}
              <span
                style={{
                  color: 'var(--status-overdue-text)',
                  fontFamily: 'var(--font-mono)',
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
          className="inline-flex appearance-none items-center justify-center border-0 bg-transparent cursor-pointer transition-opacity duration-150 ease-out hover:opacity-80"
          onClick={handleLogin}
          style={{
            minHeight: 44,
            margin: '-12px 0',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--fg-1)',
            padding: '0 4px',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {isExpired ? t('auth.login') : t('auth.refresh')}
        </button>
      </div>
    </div>
  )
}
