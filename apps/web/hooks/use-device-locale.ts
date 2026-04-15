'use client'

import { useSyncExternalStore } from 'react'
import { getSystemLocale } from '@orbit/shared/utils'

// Browser UI language (navigator.language) often differs from the OS regional
// format (Intl.DateTimeFormat). On Windows, Chrome may report 'pt-BR' as the
// UI language while the Windows regional format is set to en-US with M/d/yyyy.
// We prefer the regional format because that's what the user actually reads.
//
// SSR returns a stable default; the client subscribes via useSyncExternalStore
// and updates after hydration. Reading Intl in the SSR snapshot would render
// server vs. client mismatches whenever those locales differ.
const SSR_DEFAULT_LOCALE = 'en-US'

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('languagechange', callback)
  return () => window.removeEventListener('languagechange', callback)
}

function getClientSnapshot(): string {
  return getSystemLocale()
}

function getServerSnapshot(): string {
  return SSR_DEFAULT_LOCALE
}

export function useDeviceLocale(): string {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
