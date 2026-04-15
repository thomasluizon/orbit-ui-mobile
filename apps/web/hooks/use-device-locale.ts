'use client'

import { useEffect, useState } from 'react'
import { getSystemLocale } from '@orbit/shared/utils'

// Browser UI language (navigator.language) often differs from the OS regional
// format (Intl.DateTimeFormat). On Windows, Chrome may report 'pt-BR' as the
// UI language while the Windows regional format is set to en-US with M/d/yyyy.
// We prefer the regional format because that's what the user actually reads.
function readSystemLocale(): string {
  return getSystemLocale()
}

export function useDeviceLocale(): string {
  const [locale, setLocale] = useState<string>(() => readSystemLocale())

  useEffect(() => {
    const handleChange = () => setLocale(readSystemLocale())
    window.addEventListener('languagechange', handleChange)
    return () => window.removeEventListener('languagechange', handleChange)
  }, [])

  return locale
}
