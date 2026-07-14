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
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              color: 'var(--fg-1)',
            }}
          >
            {t('profile.freshStart.successTitle')}
          </p>
          <p
            className="mt-2"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--fg-2)',
            }}
          >
            {t('profile.freshStart.successSubtitle')}
          </p>
        </div>
      </div>
    </output>
  )

  // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- unreachable during SSR: the `if (!mounted) return null` above (useIsClient) returns before this createPortal on the server and first hydration render https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  return createPortal(overlay, document.body)
}
