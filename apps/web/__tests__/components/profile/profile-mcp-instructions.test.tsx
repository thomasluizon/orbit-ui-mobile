import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { buildMcpConfigJson } from '@orbit/shared/utils/advanced-settings'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const settings = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  return {
    ...actual,
    useLocale: () => settings.locale,
    useTranslations: () => actual.createTranslator({ locale: settings.locale, messages: settings.locale === 'en' ? messages : ptBR }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: vi.fn(),
  }),
}))

import { ProfileApiKeys } from '@/components/profile/profile-api-keys'


afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); settings.locale = 'en' })

function renderKeys(hasProAccess = true, unlocked = true) {
  vi.stubEnv('NEXT_PUBLIC_EVENT_API_BASE', 'https://api-staging.useorbit.org/')
  return render(<QueryClientProvider client={new QueryClient()}><ProfileApiKeys profile={createMockProfile({ hasProAccess })} unlocked={unlocked} /></QueryClientProvider>)
}

it.each([['en', en], ['pt-BR', ptBR]] as const)('reaches and copies the production code-client configuration in %s', async (locale, messages) => {
  settings.locale = locale
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  renderKeys()
  expect(screen.getByText('https://api-staging.useorbit.org/mcp')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.claudeCode }))
  const configuration = buildMcpConfigJson('https://api-staging.useorbit.org/mcp')
  expect(screen.getByText(messages.orbitMcp.configInstructions)).toBeInTheDocument()
  expect(screen.getByText(messages.orbitMcp.replaceKey)).toBeInTheDocument()
  expect(screen.getByText(/"mcpServers"/).textContent).toBe(configuration)
  fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.copyConfig }))
  expect(await screen.findByText(messages.orbitMcp.copied)).toBeInTheDocument()
  expect(writeText).toHaveBeenCalledExactlyOnceWith(configuration)
  expect(JSON.parse(writeText.mock.calls[0]![0])).toEqual({
    mcpServers: {
      orbit: {
        type: 'http',
        url: 'https://api-staging.useorbit.org/mcp',
        headers: { Authorization: 'Bearer YOUR_API_KEY' },
      },
    },
  })
  fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.claudeWeb }))
  expect(screen.getByText('https://api-staging.useorbit.org/mcp')).toBeInTheDocument()
  expect(screen.queryByText(messages.orbitMcp.replaceKey)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: messages.orbitMcp.claudeCode }))
  expect(screen.getByRole('button', { name: messages.orbitMcp.copyConfig })).toBeEnabled()
  expect(screen.queryByText(messages.orbitMcp.copied)).not.toBeInTheDocument()
})

it('disables repeated copies while the clipboard request is pending', async () => {
  let finishCopy!: () => void
  const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve }))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  renderKeys()
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.claudeCode }))
  const copy = screen.getByRole('button', { name: en.orbitMcp.copyConfig })
  fireEvent.click(copy)
  expect(copy).toBeDisabled()
  fireEvent.click(copy)
  expect(writeText).toHaveBeenCalledTimes(1)
  await act(async () => finishCopy())
  expect(screen.getByRole('button', { name: en.orbitMcp.copyConfig })).toBeEnabled()
})

it('shows a recoverable clipboard failure and lets the copy be retried', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('clipboard denied')).mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  renderKeys()
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.claudeCode }))
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.copyConfig }))
  expect(await screen.findByText(en.orbitMcp.configCopyError)).toBeInTheDocument()
  expect(screen.queryByText(en.orbitMcp.copied)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.copyConfig }))
  expect(await screen.findByText(en.orbitMcp.copied)).toBeInTheDocument()
  expect(screen.queryByText(en.orbitMcp.configCopyError)).not.toBeInTheDocument()
})

it.each([[false, false], [true, false]])('keeps configuration behind the existing access gate (%s, %s)', (hasProAccess, unlocked) => {
  renderKeys(hasProAccess, unlocked)
  expect(screen.queryByRole('button', { name: en.orbitMcp.claudeCode })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: en.orbitMcp.copyConfig })).not.toBeInTheDocument()
})

it('keeps the JSON available when clipboard access is unavailable', async () => {
  vi.stubGlobal('navigator', {})
  renderKeys()
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.claudeCode }))
  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.copyConfig }))
  expect(await screen.findByText(en.orbitMcp.configCopyError)).toBeInTheDocument()
  expect(screen.getByText(/"mcpServers"/).textContent).toBe(buildMcpConfigJson('https://api-staging.useorbit.org/mcp'))
})
