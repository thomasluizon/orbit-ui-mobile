import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createApiClientError } from '@orbit/shared/utils'

const mocks = vi.hoisted(() => ({
  previewReturn: {} as Record<string, unknown>,
  sendMutate: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  onClose: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useInvitePreview: () => mocks.previewReturn,
  useSendFriendRequest: () => ({ mutateAsync: mocks.sendMutate, isPending: false }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}))

import { InviteConfirmSheet } from '@/app/(app)/social/_components/invite-confirm-sheet'

const previewData = {
  handle: 'grace_h',
  displayName: 'Grace Hopper',
  isSelf: false,
  isAlreadyFriend: false,
  hasPendingRequest: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.previewReturn = { data: undefined, isLoading: false, isError: false, error: null }
  mocks.sendMutate.mockResolvedValue({ id: 'fr-1' })
})

describe('InviteConfirmSheet', () => {
  it('renders nothing while the code is null', () => {
    const { container } = render(<InviteConfirmSheet code={null} onClose={mocks.onClose} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the loading skeleton while the preview is pending', () => {
    mocks.previewReturn = { data: undefined, isLoading: true, isError: false, error: null }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByTestId('invite-preview-loading')).toBeInTheDocument()
  })

  it('previews the owner and sends a request with the referral code', async () => {
    mocks.previewReturn = { data: previewData, isLoading: false, isError: false, error: null }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('@grace_h')).toBeInTheDocument()

    fireEvent.click(screen.getByText('social.invite.sendRequest'))
    expect(mocks.sendMutate).toHaveBeenCalledWith({ referralCode: 'REF123' })

    await waitFor(() => {
      expect(mocks.showSuccess).toHaveBeenCalledWith('social.addFriend.success')
      expect(mocks.onClose).toHaveBeenCalled()
    })
  })

  it('shows the self-link message for your own invite', () => {
    mocks.previewReturn = {
      data: { ...previewData, isSelf: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByText('social.invite.self')).toBeInTheDocument()
    expect(screen.queryByText('social.invite.sendRequest')).not.toBeInTheDocument()
  })

  it('shows the already-friends message with the handle', () => {
    mocks.previewReturn = {
      data: { ...previewData, isAlreadyFriend: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(
      screen.getByText('social.invite.alreadyFriends({"handle":"grace_h"})'),
    ).toBeInTheDocument()
  })

  it('shows the pending-request message with the handle', () => {
    mocks.previewReturn = {
      data: { ...previewData, hasPendingRequest: true },
      isLoading: false,
      isError: false,
      error: null,
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByText('social.invite.pending({"handle":"grace_h"})')).toBeInTheDocument()
  })

  it('shows the unknown-code message on a 404 preview error', () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(404, null, 'Not found'),
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByText('social.invite.unknownCode')).toBeInTheDocument()
  })

  it('shows the enable-social message on a 403 preview error', () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(403, { errorCode: 'SOCIAL_DISABLED' }, 'Forbidden'),
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByText('social.optInGate.body')).toBeInTheDocument()
    expect(screen.queryByText('social.invite.sendRequest')).not.toBeInTheDocument()
  })

  it('shows the generic load error on a non-404 preview error', () => {
    mocks.previewReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: createApiClientError(500, null, 'Server error'),
    }
    render(<InviteConfirmSheet code="REF123" onClose={mocks.onClose} />)
    expect(screen.getByText('social.invite.loadError')).toBeInTheDocument()
  })
})
