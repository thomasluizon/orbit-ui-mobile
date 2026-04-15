import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title }: { open: boolean; children: React.ReactNode; title?: string }) => {
    if (!open) return null
    return (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    )
  },
}))

import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'

describe('CreateApiKeyModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCreateKey: vi.fn(),
    availableScopes: [],
  }

  beforeEach(() => {
    defaultProps.onOpenChange.mockClear()
    defaultProps.onCreateKey.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateApiKeyModal {...defaultProps} open={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the create form when open', () => {
    render(<CreateApiKeyModal {...defaultProps} />)
    expect(screen.getByLabelText('orbitMcp.keyName')).toBeInTheDocument()
  })

  it('shows validation error when submitting empty name', () => {
    render(<CreateApiKeyModal {...defaultProps} />)
    const form = screen.getByLabelText('orbitMcp.keyName').closest('form')
    fireEvent.submit(form!)
    expect(screen.getByText('orbitMcp.keyNameRequired')).toBeInTheDocument()
  })

  it('shows validation error for name exceeding 50 chars', () => {
    render(<CreateApiKeyModal {...defaultProps} />)
    const input = screen.getByLabelText('orbitMcp.keyName')
    fireEvent.change(input, { target: { value: 'A'.repeat(51) } })
    const form = input.closest('form')
    fireEvent.submit(form!)
    expect(screen.getByText('orbitMcp.keyNameMaxLength')).toBeInTheDocument()
  })

  it('calls onCreateKey with trimmed name on submit', async () => {
    defaultProps.onCreateKey.mockResolvedValue({
      id: 'key-1',
      key: 'sk-test-123',
      name: 'My Key',
      keyPrefix: 'sk-test',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
      createdAtUtc: '2025-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    })

    render(<CreateApiKeyModal {...defaultProps} />)
    const input = screen.getByLabelText('orbitMcp.keyName')
    fireEvent.change(input, { target: { value: '  My Key  ' } })
    const form = input.closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(defaultProps.onCreateKey).toHaveBeenCalledWith({
        name: 'My Key',
        scopes: undefined,
        isReadOnly: false,
        expiresAtUtc: null,
      })
    })
  })

  it('preserves datetime-local input as a UTC timestamp without timezone shifting', async () => {
    defaultProps.onCreateKey.mockResolvedValue({
      id: 'key-1',
      key: 'sk-test-123',
      name: 'My Key',
      keyPrefix: 'sk-test',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: '2026-04-20T18:45:00.000Z',
      createdAtUtc: '2025-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    })

    render(<CreateApiKeyModal {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('orbitMcp.keyName'), { target: { value: 'My Key' } })
    fireEvent.change(screen.getByLabelText('orbitMcp.expiresAtLabel'), {
      target: { value: '2026-04-20T18:45' },
    })

    fireEvent.submit(screen.getByLabelText('orbitMcp.keyName').closest('form')!)

    await waitFor(() => {
      expect(defaultProps.onCreateKey).toHaveBeenCalledWith({
        name: 'My Key',
        scopes: undefined,
        isReadOnly: false,
        expiresAtUtc: '2026-04-20T18:45:00.000Z',
      })
    })
  })

  it('shows the key after creation', async () => {
    defaultProps.onCreateKey.mockResolvedValue({
      id: 'key-1',
      key: 'sk-test-secret-123',
      name: 'My Key',
      keyPrefix: 'sk-test',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
      createdAtUtc: '2025-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    })

    render(<CreateApiKeyModal {...defaultProps} />)
    const input = screen.getByLabelText('orbitMcp.keyName')
    fireEvent.change(input, { target: { value: 'My Key' } })
    const form = input.closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(screen.getByText('sk-test-secret-123')).toBeInTheDocument()
    })
  })

  it('displays API error when present', () => {
    render(<CreateApiKeyModal {...defaultProps} apiError="Rate limited" />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
  })
})
