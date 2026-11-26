'use client'

import type { useTranslations } from 'next-intl'
import { WifiOff } from '@/components/ui/icons'

type Translate = ReturnType<typeof useTranslations>

export function ReferralBanner({ t }: Readonly<{ t: Translate }>) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span aria-hidden className="h-px bg-[var(--hairline)]" />
      <p className="font-mono text-xs uppercase leading-[1.6] tracking-[0.06em] text-[var(--fg-3)]">{t('referral.loginBanner')}</p>
      <span aria-hidden className="h-px bg-[var(--hairline)]" />
    </div>
  )
}

export function LoginOfflineNotice({ t }: Readonly<{ t: Translate }>) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-3" data-offline-notice>
      <WifiOff size={20} aria-hidden className="shrink-0 text-[var(--fg-3)]" />
      <p className="text-sm leading-normal text-[var(--fg-2)]">{t('auth.errors.offline')}</p>
    </div>
  )
}

export function LoginValidationMessage({ message, isOnline }: Readonly<{ message?: string; isOnline: boolean }>) {
  const visibleMessage = isOnline ? message : undefined
  return <p role="status" aria-live="polite" aria-atomic="true"
    className={visibleMessage ? 'whitespace-pre-line text-sm text-[var(--status-bad-text)]' : 'sr-only'}>{visibleMessage}</p>
}
