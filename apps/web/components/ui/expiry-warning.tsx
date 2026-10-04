'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '@/stores/auth-store'

const EXPIRY_ACTION_STYLE = {
  minHeight: TOUCH_TARGET_MIN,
  margin: '-12px 0',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--fg-1)',
  padding: '0 8px',
  transitionDuration: 'var(--dur-hover-control), 150ms',
  transitionTimingFunction: 'var(--ease-standard), var(--ease-out)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
} as const

export function ExpiryWarning() {
  const t = useTranslations()
  const { sessionRefreshFailed, logout } = useAuthStore()

  const handleSignIn = useCallback(() => {
    void logout()
  }, [logout])

  if (!sessionRefreshFailed) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed left-0 right-0 z-toast mx-auto"
      style={{ top: 0, maxWidth: 'var(--app-max-w)' }}
    >
      <div
        className="flex items-center rounded-[14px]"
        style={{
          padding: '8px 12px',
          marginTop: 'calc(var(--safe-top) + 0.25rem)',
          marginLeft: 'max(10px, var(--safe-left))',
          marginRight: 'max(10px, var(--safe-right))',
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
            fontSize: 14,
            color: 'var(--fg-2)',
          }}
        >
          <span style={{ color: 'var(--status-overdue-text)' }}>
            {t('auth.sessionSignedOut')}
          </span>
        </span>
        <button
          type="button"
          className="inline-flex appearance-none items-center justify-center border-0 bg-transparent cursor-pointer rounded-full overflow-hidden transition-[background-color,scale] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96]"
          onClick={handleSignIn}
          style={EXPIRY_ACTION_STYLE}
        >
          {t('auth.login')}
        </button>
      </div>
    </div>
  )
}
