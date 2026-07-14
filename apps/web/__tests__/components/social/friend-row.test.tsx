import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiClientError } from '@orbit/shared/utils'
import { createMockFriendSummary } from '@orbit/shared/__tests__/factories'

const showSuccess = vi.fn()
const showError = vi.fn()
const removeMutate = vi.fn()
const blockMutate = vi.fn()
const reportMutate = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess, showError, showInfo: vi.fn(), showToast: vi.fn(), showQueued: vi.fn(), dismissToast: vi.fn() }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useRemoveFriend: () => ({ mutateAsync: removeMutate, isPending: false }),
  useBlockUser: () => ({ mutateAsync: blockMutate, isPending: false }),
  useReportUser: () => ({ mutateAsync: reportMutate, isPending: false }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, footer, title }: {
    open: boolean; children: React.ReactNode; footer?: React.ReactNode; title?: string
  }) => (open ? <div data-testid="overlay">{title}{children}{footer}</div> : null),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm, confirmLabel }: {
    open: boolean; onConfirm: () => void; confirmLabel: string
  }) => (open ? <button type="button" onClick={onConfirm}>{confirmLabel}</button> : null),
}))

vi.mock('@/components/ui/settings-group', () => ({
  SettingsGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsGroupRow: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{label}</button>
  ),
}))

vi.mock('@/components/ui/user-avatar', () => ({ UserAvatar: () => <span data-testid="avatar" /> }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))
vi.mock('@/app/(app)/social/_components/friend-profile-view', () => ({ FriendProfileView: () => null }))

import { FriendRow } from '@/app/(app)/social/_components/friend-row'

const friend = createMockFriendSummary({ userId: 'u-1', displayName: 'Ada Lovelace', currentStreak: 7 })

describe('FriendRow', () => {
  beforeEach(() => {
    showSuccess.mockClear()
    showError.mockClear()
    removeMutate.mockReset()
    blockMutate.mockReset()
    reportMutate.mockReset()
  })

  it('cheers the friend with their identity', () => {
    const onCheer = vi.fn()
    render(<FriendRow friend={friend} onCheer={onCheer} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.cheer' }))
    expect(onCheer).toHaveBeenCalledWith({ recipientId: 'u-1', displayName: 'Ada Lovelace' })
  })

  it('opens the action sheet with all four actions', () => {
    render(<FriendRow friend={friend} onCheer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.moreActions' }))
    expect(screen.getByRole('button', { name: 'social.friends.remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'social.friends.block' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'social.friends.report' })).toBeInTheDocument()
  })

  it('removes the friend when the removal is confirmed', async () => {
    removeMutate.mockResolvedValue(undefined)
    render(<FriendRow friend={friend} onCheer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.moreActions' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.remove' }))
    await waitFor(() => expect(removeMutate).toHaveBeenCalledWith('u-1'))
  })

  it('confirms a block and reports a success toast', async () => {
    blockMutate.mockResolvedValue(undefined)
    render(<FriendRow friend={friend} onCheer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.moreActions' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.block' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.block' }))
    await waitFor(() => expect(blockMutate).toHaveBeenCalledWith('u-1'))
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('social.block.success'))
  })

  it('surfaces a mapped error toast when an action fails', async () => {
    blockMutate.mockRejectedValue(new ApiClientError(500, 'boom'))
    render(<FriendRow friend={friend} onCheer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.moreActions' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.block' }))
    fireEvent.click(screen.getByRole('button', { name: 'social.friends.block' }))
    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1))
    expect(showSuccess).not.toHaveBeenCalled()
  })
})
