import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

let mockProfile: Record<string, unknown> | null = null

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => <span data-testid="pro-badge">PRO</span>,
}))

let mockApiKeys: { id: string; name: string; keyPrefix: string; createdAtUtc: string; lastUsedAtUtc: string | null }[] = []
let mockApiKeysLoading = false
let mockApiKeysError: Error | null = null

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    // API keys query
    if (Array.isArray(queryKey) && queryKey.some((k) => typeof k === 'string' && k.includes('api'))) {
      return {
        data: mockApiKeysLoading ? undefined : mockApiKeys,
        isLoading: mockApiKeysLoading,
        error: mockApiKeysError,
      }
    }
    return { data: undefined, isLoading: false, error: null }
  },
  useMutation: ({ mutationFn }: { mutationFn: (...args: unknown[]) => unknown }) => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    mutateAsync: mutationFn,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@orbit/shared/query', () => ({
  apiKeyKeys: {
    lists: () => ['api-keys', 'list'],
    all: ['api-keys'],
  },
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    apiKeys: { list: '/api/api-keys', create: '/api/api-keys' },
  },
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) => {
    if (!open) return null
    return (
      <div data-testid="overlay" aria-label={title}>
        {children}
      </div>
    )
  },
}))

vi.mock('@/components/ui/create-api-key-modal', () => ({
  CreateApiKeyModal: ({ open }: { open: boolean }) => {
    if (!open) return null
    return <div data-testid="create-key-modal">Create API Key Modal</div>
  },
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import AdvancedPage from '@/app/(app)/advanced/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvancedPage', () => {
  beforeEach(() => {
    mockProfile = {
      id: 'u1',
      timeZone: 'America/New_York',
      hasProAccess: true,
    }
    mockApiKeys = []
    mockApiKeysLoading = false
    mockApiKeysError = null
  })

  it('renders without crashing', () => {
    const { container } = render(<AdvancedPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back link', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('advancedSettings.title')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'common.backToProfile' })).toHaveAttribute('href', '/profile')
  })

  // ---- Widget tip ----

  it('renders widget tip button', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('profile.widgetTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.widgetHint')).toBeInTheDocument()
  })

  it('opens widget info overlay on click', () => {
    render(<AdvancedPage />)
    const widgetButton = screen.getByText('profile.widgetTitle').closest('button')!
    expect(widgetButton).toHaveAttribute('aria-haspopup', 'dialog')
    expect(widgetButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(widgetButton)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    expect(screen.getByText('profile.widgetHow.title')).toBeInTheDocument()
  })

  it('shows widget setup steps in overlay', () => {
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('profile.widgetTitle').closest('button')!)
    expect(screen.getByText('profile.widgetHow.step1')).toBeInTheDocument()
    expect(screen.getByText('profile.widgetHow.step2')).toBeInTheDocument()
    expect(screen.getByText('profile.widgetHow.step3')).toBeInTheDocument()
  })

  it('shows widget features in overlay', () => {
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('profile.widgetTitle').closest('button')!)
    expect(screen.getByText('profile.widgetHow.featuresTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.widgetHow.feature1')).toBeInTheDocument()
  })

  // ---- For Developers / MCP section ----

  it('renders MCP section title with ProBadge', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.title')).toBeInTheDocument()
    expect(screen.getByTestId('pro-badge')).toBeInTheDocument()
  })

  it('renders MCP description', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.description')).toBeInTheDocument()
  })

  it('shows upgrade link for non-Pro users', () => {
    mockProfile = { ...mockProfile, hasProAccess: false }
    render(<AdvancedPage />)
    const upgradeLink = screen.getAllByRole('link').find(
      (a) => a.getAttribute('href') === '/upgrade',
    )
    expect(upgradeLink).toBeTruthy()
  })

  // ---- API Keys (Pro users) ----

  it('shows API keys section for Pro users', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.apiKeys')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.apiKeysDescription')).toBeInTheDocument()
  })

  it('shows create key button for Pro users', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.createKey')).toBeInTheDocument()
  })

  it('shows empty state when no API keys', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.noKeys')).toBeInTheDocument()
  })

  it('shows API keys loading state', () => {
    mockApiKeysLoading = true
    const { container } = render(<AdvancedPage />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows API keys error state', () => {
    mockApiKeysError = new Error('Failed to load')
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.apiKeysError')).toBeInTheDocument()
  })

  it('renders API key list when keys exist', () => {
    mockApiKeys = [
      { id: 'k1', name: 'My Key', keyPrefix: 'orbit_sk_abc', createdAtUtc: '2025-01-01T00:00:00Z', lastUsedAtUtc: null },
    ]
    render(<AdvancedPage />)
    expect(screen.getByText('My Key')).toBeInTheDocument()
    expect(screen.getByText('orbit_sk_abc...')).toBeInTheDocument()
  })

  it('shows revoke button for each key', () => {
    mockApiKeys = [
      { id: 'k1', name: 'Key 1', keyPrefix: 'orbit_sk_1', createdAtUtc: '2025-01-01T00:00:00Z', lastUsedAtUtc: null },
    ]
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.revoke')).toBeInTheDocument()
  })

  it('shows revoke confirmation on click', () => {
    mockApiKeys = [
      { id: 'k1', name: 'Key 1', keyPrefix: 'orbit_sk_1', createdAtUtc: '2025-01-01T00:00:00Z', lastUsedAtUtc: null },
    ]
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('orbitMcp.revoke'))
    expect(screen.getByText('orbitMcp.revokeConfirm')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.cancel')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.confirm')).toBeInTheDocument()
  })

  it('cancels revoke confirmation', () => {
    mockApiKeys = [
      { id: 'k1', name: 'Key 1', keyPrefix: 'orbit_sk_1', createdAtUtc: '2025-01-01T00:00:00Z', lastUsedAtUtc: null },
    ]
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('orbitMcp.revoke'))
    fireEvent.click(screen.getByText('orbitMcp.cancel'))
    expect(screen.queryByText('orbitMcp.revokeConfirm')).not.toBeInTheDocument()
  })

  it('shows max keys warning when at limit', () => {
    mockApiKeys = Array.from({ length: 5 }, (_, i) => ({
      id: `k${i}`,
      name: `Key ${i}`,
      keyPrefix: `orbit_sk_${i}`,
      createdAtUtc: '2025-01-01T00:00:00Z',
      lastUsedAtUtc: null,
    }))
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.maxKeysReached')).toBeInTheDocument()
  })

  // ---- Connection Instructions ----

  it('renders connection instructions toggle', () => {
    render(<AdvancedPage />)
    expect(screen.getByText('orbitMcp.connectionInstructions')).toBeInTheDocument()
  })

  it('expands connection instructions on click', () => {
    render(<AdvancedPage />)
    const instructionsBtn = screen.getByText('orbitMcp.connectionInstructions').closest('button')!
    expect(instructionsBtn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(instructionsBtn)
    expect(instructionsBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('orbitMcp.claudeWeb')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.claudeDesktop')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.claudeCode')).toBeInTheDocument()
  })

  it('shows web instructions by default', () => {
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('orbitMcp.connectionInstructions').closest('button')!)
    expect(screen.getByText('orbitMcp.webInstructions')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.webNoApiKey')).toBeInTheDocument()
  })

  it('switches to desktop instructions tab', () => {
    render(<AdvancedPage />)
    fireEvent.click(screen.getByText('orbitMcp.connectionInstructions').closest('button')!)
    fireEvent.click(screen.getByText('orbitMcp.claudeDesktop'))
    expect(screen.getByText('orbitMcp.configInstructions')).toBeInTheDocument()
    expect(screen.getByText('orbitMcp.replaceKey')).toBeInTheDocument()
  })

  it('does not show API keys section for non-Pro users', () => {
    mockProfile = { ...mockProfile, hasProAccess: false }
    render(<AdvancedPage />)
    expect(screen.queryByText('orbitMcp.apiKeys')).not.toBeInTheDocument()
  })

  it('renders with null profile without crashing', () => {
    mockProfile = null
    const { container } = render(<AdvancedPage />)
    expect(container).toBeTruthy()
    expect(screen.getByText('advancedSettings.title')).toBeInTheDocument()
  })
})
