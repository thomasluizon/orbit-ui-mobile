'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { subscribePush } from '@/app/actions/notifications'

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
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
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
  const [showRetryHint, setShowRetryHint] = useState(false)

  useEffect(() => {
    if (
      typeof globalThis === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in globalThis)
    )
      return
    if (Notification.permission === 'denied') return
    if (getCookie(STORAGE_KEY) === '1') return

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub && Notification.permission === 'granted') return
        setShow(true)
        requestAnimationFrame(() => setVisible(true))
      })
      .catch(() => {
        setShow(true)
        requestAnimationFrame(() => setVisible(true))
      })
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    setCookie(STORAGE_KEY, '1', 60 * 60 * 24 * 365)
    setTimeout(() => setShow(false), 240)
  }, [])

  const handleEnable = useCallback(async () => {
    setShowRetryHint(false)
    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()

      if (permission !== 'granted') {
        dismiss()
        return
      }

      const registration = await navigator.serviceWorker.ready
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

      await subscribePush(subscription.toJSON())
      dismiss()
    } catch {
      setShowRetryHint(true)
    }
  }, [dismiss])

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label={t('pushPrompt.title')}
      className="fixed left-0 right-0 z-50 mx-auto"
      style={{
        bottom: 0,
        maxWidth: 'var(--app-max-w)',
        transition: 'opacity 240ms ease-out, transform 240ms ease-out',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <div
        className="flex flex-col"
        style={{
          padding: '14px 20px 18px',
          background: 'var(--bg-elev)',
          borderTop: '1px solid var(--hairline)',
          gap: 8,
        }}
      >
        <div className="flex items-center justify-between">
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--fg-3)',
            }}
          >
            {t('pushPrompt.eyebrow')}
          </span>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{ padding: 0, color: 'var(--fg-3)' }}
            aria-label={t('common.dismiss')}
            onClick={dismiss}
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
          }}
        >
          {t('pushPrompt.title')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-3)',
            lineHeight: 1.5,
          }}
        >
          {t('pushPrompt.description')}
        </span>
        {showRetryHint && (
          <span
            role="alert"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 12,
              color: 'var(--status-overdue)',
            }}
          >
            {t('pushPrompt.retryHint')}
          </span>
        )}
        <div className="flex items-center justify-end" style={{ gap: 22, paddingTop: 4 }}>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              padding: 6,
            }}
            onClick={dismiss}
          >
            {t('pushPrompt.later')}
          </button>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg-1)',
              padding: 6,
            }}
            onClick={handleEnable}
          >
            {t('pushPrompt.enable')}
          </button>
        </div>
      </div>
    </div>
  )
}
