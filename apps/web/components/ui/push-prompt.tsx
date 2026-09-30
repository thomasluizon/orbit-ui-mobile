'use client'

import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { Bell, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { reportAccountChangedIfNeeded } from '@/lib/client-action'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { useAccountId } from '@/lib/account-scope'
import { isPushSubscriptionOwner } from '@/lib/push-subscription-owner'
import { getActiveServiceWorkerRegistration } from '@/lib/service-worker-registration'
import {
  isPushNotificationSupported,
  subscribeToPushNotifications,
} from '@/hooks/use-push-notification-preferences'

const STORAGE_KEY = 'orbit_push_prompted'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

export function PushPrompt() {
  const t = useTranslations()
  const accountId = useAccountId()
  const overlayId = useId()
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const [eligible, setEligible] = useState(false)
  const [show, setShow] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showRetryHint, setShowRetryHint] = useState(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current)
  }, [])

  useEffect(() => {
    if (accountId === null) return
    if (!isPushNotificationSupported()) return
    if (Notification.permission === 'denied') return
    const alreadyPrompted = getCookie(STORAGE_KEY) === '1'

    getActiveServiceWorkerRegistration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub && Notification.permission === 'granted' && isPushSubscriptionOwner(accountId)) return
        if (!sub && alreadyPrompted) return
        setEligible(true)
      })
      .catch(() => {
        if (!alreadyPrompted) setEligible(true)
      })
  }, [accountId])

  useEffect(() => {
    if (!eligible || anotherOverlayOpen || show) return
    const timer = setTimeout(() => {
      if (hasOpenPromptBlockingOverlay(useUIStore.getState())) return
      setShow(true)
      requestAnimationFrame(() => setVisible(true))
    }, 0)
    return () => clearTimeout(timer)
  }, [eligible, anotherOverlayOpen, show])

  useEffect(() => {
    if (!show) return
    registerOpenOverlay(overlayId)
    return () => unregisterOpenOverlay(overlayId)
  }, [show, overlayId, registerOpenOverlay, unregisterOpenOverlay])

  const dismiss = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current)
    setEligible(false)
    setVisible(false)
    setCookie(STORAGE_KEY, '1', 60 * 60 * 24 * 365)
    dismissTimer.current = setTimeout(() => {
      dismissTimer.current = null
      setShow(false)
    }, 240)
  }, [])

  useOverlayEscape({ open: show, onDismiss: dismiss, restoreFocus: false })

  const handleEnable = useCallback(async () => {
    setShowRetryHint(false)
    try {
      await subscribeToPushNotifications(undefined, { reuseExisting: true })
      dismiss()
    } catch (error) {
      reportAccountChangedIfNeeded(error)
      if (reportsAccountChanged(error)) return
      setShowRetryHint(true)
    }
  }, [dismiss])

  if (!show) return null

  return (
    <div
      // react-doctor-disable-next-line prefer-html-dialog -- intentional non-modal bottom-anchored notification prompt with custom fixed positioning + slide transition; native <dialog> centering/backdrop semantics would break the layout and steal focus https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      role="dialog"
      aria-label={t('pushPrompt.title')}
      className="fixed left-0 right-0 z-50 mx-auto transition-[opacity,transform] duration-[240ms] ease-out motion-reduce:transition-none"
      style={{
        bottom: 0,
        maxWidth: 'var(--app-max-w)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <div
        className="flex flex-col rounded-t-[26px]"
        style={{
          padding: '20px 22px calc(20px + var(--safe-bottom))',
          background: 'var(--bg-sheet)',
          boxShadow: 'var(--shadow-3), inset 0 0 0 1px var(--hairline)',
          gap: 8,
        }}
      >
        <div className="flex items-start justify-between">
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-full"
            style={{
              width: 44,
              height: 44,
              background: 'rgba(var(--primary-rgb), 0.15)',
              color: 'var(--primary-soft)',
            }}
          >
            <Bell size={22} strokeWidth={1.8} />
          </span>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer flex items-center justify-center -mr-2 -mt-1"
            style={{ width: 44, height: 44, color: 'var(--fg-3)' }}
            aria-label={t('common.dismiss')}
            onClick={dismiss}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {t('pushPrompt.title')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            lineHeight: 1.5,
          }}
        >
          {t('pushPrompt.description')}
        </span>
        {showRetryHint && (
          <span
            role="alert"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--status-overdue-text)',
            }}
          >
            {t('pushPrompt.retryHint')}
          </span>
        )}
        <div className="flex flex-col" style={{ gap: 10, paddingTop: 10 }}>
          <PillButton fullWidth onClick={() => void handleEnable()}>
            {t('pushPrompt.enable')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onClick={dismiss}>
            {t('pushPrompt.later')}
          </PillButton>
        </div>
      </div>
    </div>
  )
}
