'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'

interface FreshStartAnimationProps {
  onComplete: () => void
}

export function FreshStartAnimation({ onComplete }: Readonly<FreshStartAnimationProps>) {
  const t = useTranslations()
  const [isVisible, setIsVisible] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const mounted = useIsClient()

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true)
    }, 2000)

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
      <div className="absolute inset-0 bg-[var(--bg)]" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8">
        <div className="fresh-start-ring fresh-start-ring-1" />
        <div className="fresh-start-ring fresh-start-ring-2" />

        <div className="fresh-start-orb">
          <RefreshCw className="size-8 text-[var(--fg-1)]" />
        </div>

        <div className="fresh-start-text mt-10 text-center">
          <p className="text-[length:var(--text-fluid-xl)] font-bold text-[var(--fg-1)] tracking-tight">
            {t('profile.freshStart.successTitle')}
          </p>
          <p className="text-[length:var(--text-fluid-sm)] text-[var(--fg-2)] mt-2">
            {t('profile.freshStart.successSubtitle')}
          </p>
        </div>
      </div>
    </output>
  )

  return createPortal(overlay, document.body)
}
