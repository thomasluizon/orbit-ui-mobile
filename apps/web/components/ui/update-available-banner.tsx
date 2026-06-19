'use client'

import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useVersionGateStore } from '@/stores/version-gate-store'

export function UpdateAvailableBanner() {
  const t = useTranslations()
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  const [dismissed, setDismissed] = useState(false)

  if (!upgradeRequired || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-update-banner=""
      className="flex items-center"
      style={{
        padding: '9px 14px',
        gap: 12,
        background: 'rgba(var(--primary-rgb), 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.18)',
      }}
    >
      <span
        className="flex-1"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        {t('forceUpdate.banner')}
      </span>
      <button
        type="button"
        className="inline-flex items-center transition-opacity duration-150 ease-out hover:opacity-80"
        style={{
          gap: 4,
          minHeight: 44,
          margin: '-12px 0',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--primary-soft)',
          padding: '0 4px',
        }}
        onClick={() => globalThis.location.reload()}
      >
        <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
        {t('forceUpdate.refresh')}
      </button>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        className="icon-btn hover:text-[var(--fg-1)]"
        style={{
          width: 40,
          height: 40,
          margin: '-10px -8px',
          color: 'var(--fg-3)',
        }}
        onClick={() => setDismissed(true)}
      >
        <X size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}
