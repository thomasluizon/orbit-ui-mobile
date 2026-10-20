import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { setApiFetchTranslate } = vi.hoisted(() => ({ setApiFetchTranslate: vi.fn() }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `translated:${key}` }))
vi.mock('@/lib/api-fetch', () => ({ setApiFetchTranslate }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/step-up/step-up-screen', () => ({ StepUpScreen: () => null }))

import StepUpPage from '@/app/step-up/page'

describe('StepUpPage', () => {
  it('registers recovery translations on direct entry', async () => {
    render(await StepUpPage())

    await waitFor(() => expect(setApiFetchTranslate).toHaveBeenCalledTimes(1))
    const translate = setApiFetchTranslate.mock.calls[0]?.[0] as (key: string) => string
    expect(translate('errors.api.appUpdated')).toBe('translated:errors.api.appUpdated')
  })
})
