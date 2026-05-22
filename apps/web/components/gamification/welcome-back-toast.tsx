'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useProfile } from '@/hooks/use-profile'

type ToastVariant = 'welcome' | 'referral'

export function WelcomeBackToast() {
  const t = useTranslations()
  const { profile } = useProfile()
  const [variant, setVariant] = useState<ToastVariant>('welcome')
  const [message, setMessage] = useState('')
  const mounted = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const checkedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  function showToast(nextMessage: string, kind: ToastVariant) {
    setMessage(nextMessage)
    setVariant(kind)
    setShouldRender(true)
    requestAnimationFrame(() => setIsVisible(true))
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => setShouldRender(false), 300)
    }, 4000)
  }

  function dismiss() {
    setIsVisible(false)
    setTimeout(() => setShouldRender(false), 300)
  }

  useEffect(() => {
    if (!profile || checkedRef.current) return
    checkedRef.current = true

    const referralApplied = localStorage.getItem('orbit_referral_applied')
    if (referralApplied) {
      localStorage.removeItem('orbit_referral_applied')
      setTimeout(() => {
        showToast(t('referral.applied'), 'referral')
      }, 800)
      return
    }

    const now = Date.now()
    const lastVisit = Number(localStorage.getItem('orbit_last_visit') ?? '0')
    localStorage.setItem('orbit_last_visit', String(now))

    const twentyFourHours = 24 * 60 * 60 * 1000
    if (
      lastVisit > 0 &&
      now - lastVisit > twentyFourHours &&
      (profile.currentStreak ?? 0) > 0
    ) {
      setTimeout(() => {
        showToast(t('welcome.backMessage', { streak: profile.currentStreak }), 'welcome')
      }, 800)
    }
  }, [profile, t])

  if (!mounted || !shouldRender) return null

  const eyebrow =
    variant === 'welcome'
      ? t('welcome.eyebrow')
      : t('referral.eyebrow')

  return createPortal(
    <button
      type="button"
      aria-label={message}
      className="fixed left-1/2 appearance-none border-0 cursor-pointer text-left"
      style={{
        top: 56,
        maxWidth: 380,
        width: 'calc(100% - 32px)',
        padding: '14px 16px',
        background: 'var(--bg-elev)',
        borderRadius: 10,
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)',
        transition: 'opacity 400ms ease-out, transform 400ms ease-out',
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -20px) scale(0.95)',
        zIndex: 10000,
      }}
      onClick={dismiss}
    >
      <div className="flex items-center" style={{ gap: 14 }}>
        <div className="flex-1 flex flex-col" style={{ gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-3)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--fg-2)',
              lineHeight: 1.5,
            }}
          >
            {message}
          </span>
        </div>
        <svg width={24} height={24} aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle
            cx={12}
            cy={12}
            r={10.5}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1}
          />
        </svg>
      </div>
    </button>,
    document.body,
  )
}
