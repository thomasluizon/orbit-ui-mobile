'use client'

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import './streak-freeze-celebration.css'

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

export const StreakFreezeCelebration = forwardRef<StreakFreezeCelebrationHandle>(
  function StreakFreezeCelebration(_props, ref) {
    const t = useTranslations()
    const [visible, setVisible] = useState(false)
    const [mounted, setMounted] = useState(false)
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => {
      setMounted(true)
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      }
    }, [])

    function show() {
      setVisible(true)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false)
      }, 3000)
    }

    function dismiss() {
      setVisible(false)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }

    useImperativeHandle(ref, () => ({ show }))

    if (!mounted || !visible) return null

    return createPortal(
      <div
        className="fixed inset-0 z-[10003] flex items-center justify-center cursor-pointer"
        onClick={dismiss}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80" />

        {/* Blue radial glow */}
        <div className="freeze-glow" />

        {/* Frost particles */}
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`frost-${i}`}
            className="frost-particle"
            style={{ '--i': i + 1 } as React.CSSProperties}
          />
        ))}

        {/* Core content */}
        <div className="relative text-center freeze-content">
          {/* Shield/snowflake icon */}
          <div className="freeze-icon mx-auto mb-4">
            <svg viewBox="0 0 80 80" fill="none" className="size-20 mx-auto" style={{ filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.5))' }}>
              <circle cx="40" cy="40" r="38" fill="rgba(56, 189, 248, 0.1)" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" />
              <path d="M40 18L56 26V42C56 52 48 60 40 64C32 60 24 52 24 42V26L40 18Z" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.5" strokeLinejoin="round" />
              <line x1="40" y1="30" x2="40" y2="50" stroke="rgba(56, 189, 248, 0.8)" strokeWidth="2" strokeLinecap="round" />
              <line x1="30" y1="35" x2="50" y2="45" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="50" y1="35" x2="30" y2="45" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Title */}
          <p className="freeze-title text-3xl font-extrabold tracking-tight">
            {t('streakDisplay.freeze.celebrationTitle')}
          </p>

          {/* Subtitle */}
          <p className="freeze-subtitle text-sm text-text-secondary mt-2 font-medium">
            {t('streakDisplay.freeze.celebrationSubtitle')}
          </p>
        </div>
      </div>,
      document.body
    )
  }
)
