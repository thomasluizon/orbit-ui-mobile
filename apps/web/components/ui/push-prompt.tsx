'use client'

import { useState, useEffect, useCallback } from 'react'
import { BellRing, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

const STORAGE_KEY = 'orbit_push_prompted'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.codePointAt(i) ?? 0
  }
  return outputArray
}

export function PushPrompt() {
  const t = useTranslations()
  const [show, setShow] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in globalThis)) return
    if (Notification.permission === 'denied') return
    if (getCookie(STORAGE_KEY) === '1') return

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub && Notification.permission === 'granted') {
          // Already subscribed, don't show prompt
          return
        }
        setShow(true)
        requestAnimationFrame(() => setVisible(true))
      })
      .catch(() => {
        // If we can't check, show the prompt anyway (unless already granted)
        if (Notification.permission !== 'granted') {
          setShow(true)
          requestAnimationFrame(() => setVisible(true))
        }
      })
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    setCookie(STORAGE_KEY, '1', 60 * 60 * 24 * 365)
    setTimeout(() => setShow(false), 300)
  }, [])

  const handleEnable = useCallback(async () => {
    try {
      // Skip the permission prompt if already granted
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()

      if (permission !== 'granted') {
        dismiss()
        return
      }

      const registration = await navigator.serviceWorker.ready

      // Unsubscribe any existing subscription first
      const existing = await registration.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        dismiss()
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      })

      const keys = subscription.toJSON()
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.keys?.p256dh,
          auth: keys.keys?.auth,
        }),
      })
    } catch {
      // Subscribe failed silently
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
