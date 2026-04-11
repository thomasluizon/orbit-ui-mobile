import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiFetchI18nProvider } from '@/lib/api-fetch-i18n-provider'

const setApiFetchTranslate = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}))

vi.mock('@/lib/api-fetch', () => ({
  setApiFetchTranslate: (...args: unknown[]) => setApiFetchTranslate(...args),
}))

describe('ApiFetchI18nProvider', () => {
  it('registers the translation adapter on mount', async () => {
    render(<ApiFetchI18nProvider />)

    await waitFor(() => {
      expect(setApiFetchTranslate).toHaveBeenCalledTimes(1)
    })

    const translate = setApiFetchTranslate.mock.calls[0]?.[0] as
      | ((key: string) => string)
      | undefined

    expect(translate?.('toast.errors.validation')).toBe(
      'translated:toast.errors.validation',
    )
  })
})
