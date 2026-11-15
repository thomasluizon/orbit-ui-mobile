import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ApiKeyCreateResponse } from '@orbit/shared/types'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'

vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ label, value, minDate, onChange }: { label: string; value: string; minDate?: string; onChange: (value: string) => void }) =>
    <input aria-label={label} data-date-field="" type="date" min={minDate} value={value} onChange={(event) => onChange(event.target.value)} />,
}))

const createdKey = { id: 'key-1', name: 'Claude Desktop', keyPrefix: 'orb_', scopes: [], isReadOnly: true, expiresAtUtc: null, createdAtUtc: '2026-11-13T00:00:00Z', lastUsedAtUtc: null, isRevoked: false, key: 'orb_secret_value' } satisfies ApiKeyCreateResponse

function stubMedia(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

function Harness({ scoped = false, draft = '', timeZone = 'America/Sao_Paulo', onCreate, onClose }: Readonly<{ scoped?: boolean; draft?: string; timeZone?: string; onCreate: (...args: unknown[]) => Promise<ApiKeyCreateResponse | null>; onClose: () => void }>) {
  const [readOnly, setReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState(draft)
  const [created, setCreated] = useState<ApiKeyCreateResponse | null>(null)
  return <ApiKeyCreateFlow scoped={scoped} busy={false} error={null} isReadOnly={readOnly} onReadOnlyChange={setReadOnly} expiresAt={expiresAt} timeZone={timeZone} onExpiryChange={setExpiresAt}
    createdKey={created} onCreate={onCreate} onCreateGrantRequired={vi.fn()} onCreated={setCreated} onClose={onClose} />
}

function mount(locale: string, messages: typeof en, props: Parameters<typeof Harness>[0]) {
  return render(<NextIntlClientProvider locale={locale} messages={messages}><Harness {...props} /></NextIntlClientProvider>)
}

beforeEach(() => stubMedia(false))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const)('API key creation flow in $locale', ({ locale, messages }) => {
  describe.each([false, true])('reduced motion %s', (reducedMotion) => {
    it('asks the place, the access and the expiry, then shows the key once with copy', async () => {
      stubMedia(reducedMotion)
      const writeText = vi.fn(() => Promise.resolve())
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const onCreate = vi.fn(() => Promise.resolve(createdKey))
      const onClose = vi.fn()
      mount(locale, messages, { onCreate, onClose })
      expect(screen.getByRole('heading', { level: 1, name: messages.orbitMcp.keyName })).toBeInTheDocument()
      expect(document.querySelector('[data-orbit-state]')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
      expect(screen.getByText(messages.orbitMcp.keyNameRequired)).toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox', { name: messages.orbitMcp.keyName }), { target: { value: 'Claude Desktop' } })
      fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))

      expect(screen.getByRole('heading', { level: 1, name: messages.profile.apiKeys.accessQuestion })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.permReadOnly }))

      expect(screen.getByRole('heading', { level: 1, name: messages.profile.apiKeys.expiryQuestion })).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.queryByText(messages.orbitMcp.expiryFormatExample)).toBeNull()
      expect(screen.getByLabelText(messages.orbitMcp.expiresAtLabel)).toHaveAttribute('data-date-field')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.common.never })) })
      expect(onCreate).toHaveBeenCalledWith({ name: 'Claude Desktop', expiresAtUtc: null }, expect.any(Function))

      expect(screen.getByRole('heading', { level: 1, name: messages.orbitMcp.revealHeading })).toBeInTheDocument()
      expect(screen.getByText('orb_secret_value')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: messages.common.back })).toBeNull()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.copy })) })
      expect(writeText).toHaveBeenCalledWith('orb_secret_value')
      expect(screen.getByRole('button', { name: messages.orbitMcp.copied })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.done }))
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('asks what a scoped key can reach before the expiry, and creates it to the end of the day picked in the account zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 15, 23, 0))
    const onCreate = vi.fn((..._args: unknown[]) => Promise.resolve(createdKey))
    mount(locale, messages, { scoped: true, timeZone: 'Asia/Tokyo', onCreate, onClose: vi.fn() })
    fireEvent.change(screen.getByRole('textbox', { name: messages.orbitMcp.keyName }), { target: { value: 'Script' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.permReadWrite }))
    expect(screen.getByRole('heading', { level: 1, name: messages.profile.apiKeys.scopeLabel })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: messages.profile.apiKeys.scopeLabel }), { target: { value: 'habits:read' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    const picker = screen.getByLabelText(messages.orbitMcp.expiresAtLabel)
    expect(picker).toHaveAttribute('min', '2026-11-16')
    fireEvent.change(picker, { target: { value: '2026-11-20' } })
    expect(picker).toHaveValue('2026-11-20')
    expect(screen.getByRole('button', { name: messages.common.never })).toHaveAttribute('aria-pressed', 'false')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.apiKeys.scopeAction })) })
    expect(onCreate).toHaveBeenCalledWith({ name: 'Script', scopes: ['habits:read'], expiresAtUtc: '2026-11-20T14:59:59.000Z' }, expect.any(Function))
  })

  it('refuses a kept expiry draft that is in the past, with the reason under the date', async () => {
    const onCreate = vi.fn((..._args: unknown[]) => Promise.resolve(createdKey))
    mount(locale, messages, { draft: '2020-01-01T23:59', onCreate, onClose: vi.fn() })
    fireEvent.change(screen.getByRole('textbox', { name: messages.orbitMcp.keyName }), { target: { value: 'Script' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.permReadWrite }))
    expect(screen.getByLabelText(messages.orbitMcp.expiresAtLabel)).toHaveValue('2020-01-01')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.apiKeys.scopeAction })) })
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(messages.orbitMcp.invalidExpiry)
  })

  it('keeps every answer on the way back and asks before it drops a draft', () => {
    const onClose = vi.fn()
    mount(locale, messages, { onCreate: vi.fn(), onClose })
    fireEvent.change(screen.getByRole('textbox', { name: messages.orbitMcp.keyName }), { target: { value: 'Kept' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    expect(screen.getByRole('textbox', { name: messages.orbitMcp.keyName })).toHaveValue('Kept')
    fireEvent.click(screen.getByRole('button', { name: messages.common.close }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(messages.common.discardChangesTitle)).toBeInTheDocument()
  })
})
