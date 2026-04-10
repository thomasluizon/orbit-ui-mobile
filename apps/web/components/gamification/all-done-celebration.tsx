'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import './all-done-celebration.css'

export function AllDoneCelebration() {
  const t = useTranslations()
  const allDoneCelebration = useUIStore((s) => s.allDoneCelebration)
  const setAllDoneCelebration = useUIStore((s) => s.setAllDoneCelebration)
  const [mounted, setMounted] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (allDoneCelebration) {

      setShouldRender(true)
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {

        setIsVisible(false)
        setAllDoneCelebration(false)
        setTimeout(() => setShouldRender(false), 300)
      }, 3500)
    }
  }, [allDoneCelebration, setAllDoneCelebration])

  function dismiss() {

    setIsVisible(false)
    setAllDoneCelebration(false)
    setTimeout(() => setShouldRender(false), 300)
  }

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div role="status" aria-live="polite">
      <button
        type="button"
        aria-label={t('habits.allDoneCelebrationTitle')}
        className="fixed inset-0 z-[10003] flex items-center justify-center cursor-pointer appearance-none bg-transparent border-none p-0 w-full"
        style={{
          transition: 'opacity 0.3s ease-out',
          opacity: isVisible ? 1 : 0,
        }}
        onClick={dismiss}
      >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Radial glow */}
      <div className="all-done-glow-bg" />

      {/* Starburst rays */}
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={`ray-${i}`}
          className="all-done-starburst-ray"
          style={{ '--i': i + 1 } as React.CSSProperties}
        />
      ))}

      {/* Confetti particles */}
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={`confetti-${i}`}
          className="all-done-confetti"
          style={{ '--i': i + 1 } as React.CSSProperties}
        />
      ))}

      {/* Orbit ring shockwaves */}
      <div className="all-done-ring all-done-ring-1" />
      <div className="all-done-ring all-done-ring-2" />
      <div className="all-done-ring all-done-ring-3" />

      {/* Core content */}
      <div className="relative text-center all-done-content">
        {/* Checkmark icon */}
        <div className="all-done-check-icon mx-auto mb-4">
          <svg viewBox="0 0 80 80" fill="none" className="size-20 mx-auto" aria-hidden="true" style={{ filter: 'drop-shadow(0 0 24px rgba(var(--primary-shadow), 0.5))' }}>
            <circle cx="40" cy="40" r="38" fill="var(--color-primary)" opacity="0.15" stroke="var(--color-primary)" strokeWidth="2" />
            <path d="M24 40l12 12 20-24" stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        {/* Title */}
        <p className="all-done-title text-3xl font-extrabold tracking-tight">
          {t('habits.allDoneCelebrationTitle')}
        </p>

        {/* Subtitle */}
        <p className="all-done-subtitle text-sm text-text-secondary mt-2 font-medium">
          {t('habits.allDoneCelebrationSubtitle')}
        </p>
      </div>
      </button>
    </div>,
    document.body
  )
}
