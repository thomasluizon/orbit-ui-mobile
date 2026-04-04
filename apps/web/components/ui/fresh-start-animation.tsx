'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface FreshStartAnimationProps {
  onComplete: () => void
}

export function FreshStartAnimation({ onComplete }: FreshStartAnimationProps) {
  const t = useTranslations()
  const [isVisible, setIsVisible] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Trigger entrance on next frame
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    // Start fade out at 2s
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true)
    }, 2000)

    // Emit complete at 2.5s (after fade out finishes)
    const completeTimer = setTimeout(() => {
      onComplete()
    }, 2500)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  if (!mounted) return null

  const overlay = (
    <output
      className={`fresh-start-overlay ${isVisible ? 'is-visible' : ''} ${isFadingOut ? 'is-fading-out' : ''}`}
      aria-live="assertive"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8">
        {/* Radiating rings */}
        <div className="fresh-start-ring fresh-start-ring-1" />
        <div className="fresh-start-ring fresh-start-ring-2" />

        {/* Center orb */}
        <div className="fresh-start-orb">
          <RefreshCw className="size-8 text-text-primary" />
        </div>

        {/* Text */}
        <div className="fresh-start-text mt-10 text-center">
          <p className="text-[length:var(--text-fluid-xl)] font-bold text-text-primary tracking-tight">
            {t('profile.freshStart.successTitle')}
          </p>
          <p className="text-[length:var(--text-fluid-sm)] text-text-secondary mt-2">
            {t('profile.freshStart.successSubtitle')}
          </p>
        </div>
      </div>
    </output>
  )

  return createPortal(overlay, document.body)
}
