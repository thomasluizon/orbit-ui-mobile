'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '@/stores/auth-store'
import { PillButton } from '@/components/ui/pill-button'

export function ExpiryWarning() {
  const t = useTranslations()
  const { sessionRefreshFailed, logout } = useAuthStore()
  const router = useRouter()
  const routedToSignIn = useRef(false)

  useEffect(() => {
    if (!sessionRefreshFailed) {
      routedToSignIn.current = false
      return
    }
    if (routedToSignIn.current) return
    routedToSignIn.current = true
    router.replace('/login')
  }, [router, sessionRefreshFailed])

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
        className="flex items-center rounded-[var(--r-card)]"
        style={{
          padding: "var(--orbit-space-8) var(--orbit-space-12)",
          marginTop: 'calc(var(--safe-top) + 0.25rem)',
          marginLeft: 'max(var(--orbit-space-12), var(--safe-left))',
          marginRight: 'max(var(--orbit-space-12), var(--safe-right))',
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
        <PillButton variant="ghost" size="sm" onClick={handleSignIn}>
          {t('auth.login')}
        </PillButton>
      </div>
    </div>
  )
}
