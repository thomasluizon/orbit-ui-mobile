'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'

export function WelcomeBackToast() {
  const t = useTranslations()
  const { profile } = useProfile()
  const [visible, setVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastEmoji, setToastEmoji] = useState('\uD83D\uDC4B')
  const [mounted, setMounted] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const checkedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  function showToast(message: string, emoji = '\uD83D\uDC4B') {
    setToastMessage(message)
    setToastEmoji(emoji)
    setVisible(true)
    setShouldRender(true)
    requestAnimationFrame(() => setIsVisible(true))
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      setVisible(false)
      setIsVisible(false)
      setTimeout(() => setShouldRender(false), 300)
    }, 4000)
  }

  function dismiss() {
    setVisible(false)
    setIsVisible(false)
    setTimeout(() => setShouldRender(false), 300)
  }

  useEffect(() => {
    if (!profile || checkedRef.current) return
    checkedRef.current = true

    // Check referral applied flag (set during login)
    const referralApplied = localStorage.getItem('orbit_referral_applied')
    if (referralApplied) {
      localStorage.removeItem('orbit_referral_applied')
      setTimeout(() => {
        showToast(t('referral.applied'), '\uD83C\uDF81')
      }, 800)
      return
    }

    const now = Date.now()
    const lastVisit = Number(localStorage.getItem('orbit_last_visit') ?? '0')
    localStorage.setItem('orbit_last_visit', String(now))

    // Show if >24h since last visit and user has an active streak
    const twentyFourHours = 24 * 60 * 60 * 1000
    if (lastVisit > 0 && (now - lastVisit) > twentyFourHours && (profile.currentStreak ?? 0) > 0) {
      setTimeout(() => {
        showToast(t('welcome.backMessage', { streak: profile.currentStreak }))
      }, 800)
    }
  }, [profile, t])

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div
      className="fixed top-4 left-1/2 z-[10000] max-w-sm w-[calc(100%-2rem)] bg-surface-overlay border border-border-muted rounded-2xl shadow-[var(--shadow-lg)] backdrop-blur-xl px-5 py-4 cursor-pointer"
      style={{
        transition: 'opacity 0.4s var(--ease-spring), transform 0.4s var(--ease-spring)',
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -20px) scale(0.95)',
      }}
      onClick={dismiss}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{toastEmoji}</span>
        <p className="text-sm font-medium text-text-primary">
          {toastMessage}
        </p>
      </div>
    </div>,
    document.body
  )
}
