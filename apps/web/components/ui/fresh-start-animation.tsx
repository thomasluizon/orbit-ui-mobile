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
      className={`fixed inset-0 z-[99999] transition-opacity ${
        isVisible && !isFadingOut ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ transitionDuration: isFadingOut ? '500ms' : '400ms' }}
      aria-live="assertive"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8">
        {/* Radiating rings */}
        {isVisible && (
          <>
            <div className="absolute top-1/2 left-1/2 size-20 -mt-10 -ml-10 rounded-full border-2 border-[rgba(var(--primary-shadow),0.4)] opacity-0 animate-[fresh-start-ring_1.2s_ease-out_0.2s_forwards]" />
            <div className="absolute top-1/2 left-1/2 size-20 -mt-10 -ml-10 rounded-full border-2 border-[rgba(var(--primary-shadow),0.4)] opacity-0 animate-[fresh-start-ring_1.2s_ease-out_0.4s_forwards]" />
          </>
        )}

        {/* Center orb */}
        <div
          className={`size-20 rounded-full border-2 border-primary flex items-center justify-center ${
            isVisible ? 'animate-[fresh-start-orb_0.8s_cubic-bezier(0.34,1.56,0.64,1)_forwards]' : 'opacity-0 scale-[0.3]'
          }`}
        >
          <RefreshCw className="size-8 text-text-primary" />
        </div>

        {/* Text */}
        <div
          className={`mt-10 text-center ${
            isVisible ? 'animate-[fresh-start-text_0.6s_ease-out_0.8s_forwards]' : 'opacity-0 translate-y-[10px]'
          }`}
        >
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
