'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { setApiFetchTranslate } from './api-fetch'

/**
 * Registers the app's translation function with the apiFetch module
 * so that HTTP error toasts use localised titles instead of hardcoded English.
 *
 * Render this component once inside the app layout (anywhere below NextIntlClientProvider).
 */
export function ApiFetchI18nProvider() {
  const t = useTranslations()

  useEffect(() => {
    setApiFetchTranslate((key: string) => t(key))
  }, [t])

  return null
}
