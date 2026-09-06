import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { FailureScreen } from '@/components/ui/failure-screen'
import { apiFetch } from '@/lib/api-fetch'
import { useThrottleStore } from '@/stores/throttle-store'

const payload = { error: 'Too many requests', requestId: 'real-reference', limit: 10, count: 11, retryAfterUtc: '2026-09-06T00:00:42.000Z' }

function mount(error: unknown, retry = vi.fn(), locale = 'en') {
  const messages = locale === 'en' ? en : pt
  render(<NextIntlClientProvider locale={locale} messages={messages}><FailureScreen error={error} retry={retry} /></NextIntlClientProvider>)
  return { retry, messages }
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); useThrottleStore.getState().clear() })

describe('FailureScreen', () => {
  it.each(['en', 'pt-BR'])('renders an honest failure and a real reference in %s', async (locale) => {
    const { retry, messages } = mount({ status: 500, data: { requestId: 'real-reference' } }, vi.fn(), locale)
    expect(screen.getByRole('heading').textContent).toBe(messages.errorScreen.title)
    expect(screen.getByText(messages.errorScreen.body)).toBeInTheDocument()
    expect(screen.getByText('ref real-reference')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button')) })
    expect(retry).toHaveBeenCalledOnce()
  })
  it('shows busy until the retry resolves and prevents duplicate activation', async () => {
    let finish = () => {}
    const retry = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    mount(new Error('private detail'), retry)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(screen.getByRole('button'))
    expect(retry).toHaveBeenCalledOnce()
    await act(async () => { finish() })
    expect(screen.getByRole('button')).toBeEnabled()
    expect(screen.queryByText('private detail')).not.toBeInTheDocument()
    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument()
  })
  it.each(['en', 'pt-BR'])('waits for the absolute deadline without showing a cause in %s', async (locale) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T00:00:00.000Z'))
    const { retry, messages } = mount({ status: 429, data: payload }, vi.fn(), locale)
    expect(screen.getByRole('timer')).toHaveTextContent('0:42')
    expect(screen.getByText(messages.errorScreen.throttleBody)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(retry).not.toHaveBeenCalled()
    vi.setSystemTime(new Date('2026-09-06T00:02:00.000Z'))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByRole('timer')).toHaveTextContent('0:00')
    await act(async () => { fireEvent.click(screen.getByRole('button')) })
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.queryByText(/real-reference|policy|plan/i)).not.toBeInTheDocument()
  })
  it('opens the throttle from a real client error path, leaving the error with the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 429 })))
    await expect(apiFetch('/api/habits')).rejects.toMatchObject({ status: 429 })
    mount(useThrottleStore.getState().error)
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })
})
