'use client'

import { useState, useEffect, useCallback } from 'react'
import { BellRing, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

const STORAGE_KEY = 'orbit_push_prompted'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

export function PushPrompt() {
  const t = useTranslations()
  const [show, setShow] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check conditions
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission === 'granted') return
    if (Notification.permission === 'denied') return
    if (getCookie(STORAGE_KEY) === '1') return

    setShow(true)
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    setCookie(STORAGE_KEY, '1', 60 * 60 * 24 * 365)
    setTimeout(() => setShow(false), 300)
  }, [])

  const handleEnable = useCallback(async () => {
    try {
      await Notification.requestPermission()
    } catch {
      // Permission request failed
    }
    dismiss()
  }, [dismiss])

  if (!show) return null

  return (
    <div
      className={`fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-[var(--app-max-w)] transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      }`}
    >
      <div className="bg-surface-overlay border border-border-muted rounded-lg p-4 shadow-[var(--shadow-lg)] backdrop-blur-sm flex items-start gap-3">
        <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center">
          <BellRing className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{t('pushPrompt.title')}</p>
          <p className="text-xs text-text-secondary mt-0.5">{t('pushPrompt.description')}</p>
          <div className="flex gap-2 mt-3">
            <button
              className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all active:scale-95"
              onClick={handleEnable}
            >
              {t('pushPrompt.enable')}
            </button>
            <button
              className="px-4 py-2 rounded-full text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              onClick={dismiss}
            >
              {t('pushPrompt.later')}
            </button>
          </div>
        </div>
        <button className="shrink-0 p-1 text-text-muted hover:text-text-primary" onClick={dismiss}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
