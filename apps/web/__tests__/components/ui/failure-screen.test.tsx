import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { FailureScreen } from '@/components/ui/failure-screen'
import { apiFetch } from '@/lib/api-fetch'
import { useThrottleStore } from '@/stores/throttle-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const payload = { error: 'Too many requests', requestId: 'real-reference', limit: 10, count: 11, retryAfterUtc: '2026-09-06T00:00:42.000Z' }

function mount(error: unknown, retry = vi.fn(), locale = 'en') {
  const messages = locale === 'en' ? en : pt
  render(<NextIntlClientProvider locale={locale} messages={messages}><FailureScreen error={error} retry={retry} /></NextIntlClientProvider>)
  return { retry, messages }
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); useThrottleStore.getState().clear() })

describe('FailureScreen', () => {
  it.each(['dark', 'light'] as const)('keeps the rendered reference above the text contrast floor in %s', async (theme) => {
    mount({ status: 500, data: { requestId: 'real-reference' } })
    const reference = screen.getByText('ref real-reference')
    const variables = resolveWebThemeVariables('purple', theme)
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const selectors = Array.from(reference.classList, (name) => `.${name.replace(/([^\w-])/g, '\\$1')}`)
    const stylesheet = document.createElement('style')
    compiled.root.walkRules((rule) => {
      if (!selectors.includes(rule.selector)) return
      rule.walkDecls('color', (declaration) => {
        const color = declaration.value.replace(/var\((--[\w-]+)\)/g, (_match, name: `--${string}`) => variables[name]!)
        stylesheet.textContent += `${rule.selector} { color: ${color}; }`
      })
    })
    document.head.append(stylesheet)
    try {
      const channels = getComputedStyle(reference).color.match(/[\d.]+/g)!.map(Number)
      const background = variables['--bg']!.match(/[\da-f]{2}/gi)!.map((channel) => Number.parseInt(channel, 16))
      const luminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
        const value = channel / 255
        return sum + [0.2126, 0.7152, 0.0722][index]! * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      }, 0)
      const levels = [luminance(channels), luminance(background)].sort((first, second) => first - second)
      expect((levels[1]! + 0.05) / (levels[0]! + 0.05)).toBeGreaterThanOrEqual(4.5)
    } finally { stylesheet.remove() }
  })
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
