import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

let mockProfile: Record<string, unknown> | null = null
let mockIsOnline = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))

const mockSendSupportMessage = vi.fn()
vi.mock('@/app/actions/support', () => ({
  sendSupportMessage: (...args: unknown[]) => mockSendSupportMessage(...args),
}))

vi.mock('@orbit/shared/utils', () => ({
  buildSupportRequestBody: (
    profile: Record<string, unknown> | null,
    fields: { name: string; email: string; subject: string; message: string },
  ) => ({
    name: fields.name.trim() || profile?.name,
    email: fields.email.trim() || profile?.email,
    subject: fields.subject.trim(),
    message: fields.message.trim(),
  }),
  getFriendlyErrorMessage: (_err: unknown, _t: unknown, _fallbackKey: string, _kind: string) =>
    'support.sendError',
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: ({ title, description }: { title: string; description: string }) => (
    <div role="alert">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}))

import SupportPage from '@/app/(app)/support/page'

const DRAFT_KEY = 'orbit-support-draft'

function subjectField() {
  return screen.getByRole('textbox', { name: 'profile.support.subject' })
}
function messageField() {
  return screen.getByRole('textbox', { name: 'profile.support.message' })
}
function sendButton() {
  return screen.getByRole('button', { name: 'profile.support.send' })
}

describe('SupportPage', () => {
  beforeEach(() => {
    mockProfile = { name: 'Orbit User', email: 'orbit@example.com' }
    mockIsOnline = true
    mockSendSupportMessage.mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows an explicit offline state and disables sending when offline', () => {
    mockIsOnline = false
    render(<SupportPage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
  })

  it('keeps the send button disabled until both subject and message are filled', () => {
    render(<SupportPage />)

    expect(sendButton()).toBeDisabled()
    fireEvent.change(subjectField(), { target: { value: 'Bug' } })
    expect(sendButton()).toBeDisabled()
    fireEvent.change(messageField(), { target: { value: 'It broke' } })
    expect(sendButton()).toBeEnabled()
  })

  it('sends the built payload, shows success, and clears the draft', async () => {
    mockSendSupportMessage.mockResolvedValue(undefined)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'x', message: 'y' }))
    render(<SupportPage />)

    fireEvent.change(subjectField(), { target: { value: 'Cannot log in' } })
    fireEvent.change(messageField(), { target: { value: 'Google button spins forever' } })
    fireEvent.click(sendButton())

    await waitFor(() =>
      expect(screen.getByText('profile.support.success')).toBeInTheDocument(),
    )
    expect(mockSendSupportMessage).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: 'Cannot log in',
      message: 'Google button spins forever',
    })
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('surfaces a friendly error when the send fails and stays on the form', async () => {
    mockSendSupportMessage.mockRejectedValue(new Error('boom'))
    render(<SupportPage />)

    fireEvent.change(subjectField(), { target: { value: 'Subject' } })
    fireEvent.change(messageField(), { target: { value: 'Message body' } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(screen.getByText('support.sendError')).toBeInTheDocument())
    expect(screen.queryByText('profile.support.success')).not.toBeInTheDocument()
  })

  it('hydrates the form from a stored draft', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'Saved subject', message: 'Saved message' }))
    render(<SupportPage />)

    expect(subjectField()).toHaveValue('Saved subject')
    expect(messageField()).toHaveValue('Saved message')
  })

  it('discards a corrupt stored draft instead of crashing', () => {
    localStorage.setItem(DRAFT_KEY, '{not valid json')
    render(<SupportPage />)

    expect(subjectField()).toHaveValue('')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('persists the draft while typing and removes it once emptied', () => {
    render(<SupportPage />)

    fireEvent.change(subjectField(), { target: { value: 'Draft subject' } })
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({
      subject: 'Draft subject',
    })

    fireEvent.change(subjectField(), { target: { value: '' } })
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('ignores clicks while offline even with a valid form', () => {
    mockIsOnline = false
    render(<SupportPage />)

    fireEvent.change(subjectField(), { target: { value: 'Subject' } })
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    act(() => {
      fireEvent.click(sendButton())
    })

    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })
})
