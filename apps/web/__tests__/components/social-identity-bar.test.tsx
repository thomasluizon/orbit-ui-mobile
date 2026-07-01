import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  profileReturn: { profile: undefined as unknown },
  setHandleMutate: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => mocks.profileReturn,
}))

vi.mock('@/hooks/use-friends', () => ({
  useSetHandle: () => ({ mutateAsync: mocks.setHandleMutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}))

import { SocialIdentityBar } from '@/app/(app)/social/_components/social-identity-bar'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profileReturn.profile = createMockProfile({ socialOptIn: true, handle: 'thomas' })
  mocks.setHandleMutate.mockResolvedValue(null)
})

describe('SocialIdentityBar', () => {
  it('shows the current handle and caption', () => {
    render(<SocialIdentityBar />)

    expect(screen.getByText('@thomas')).toBeInTheDocument()
    expect(screen.getByText('social.identity.caption')).toBeInTheDocument()
  })

  it('renders nothing when no handle is set', () => {
    mocks.profileReturn.profile = createMockProfile({ socialOptIn: true, handle: null })

    const { container } = render(<SocialIdentityBar />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the edit sheet and saves a valid new handle', async () => {
    render(<SocialIdentityBar />)

    fireEvent.click(screen.getByLabelText('social.identity.editAria'))

    fireEvent.change(screen.getByLabelText('social.editHandle.label'), {
      target: { value: 'newhandle' },
    })
    fireEvent.click(screen.getByText('common.save'))

    await vi.waitFor(() => {
      expect(mocks.setHandleMutate).toHaveBeenCalledWith('newhandle')
    })
    expect(mocks.showSuccess).toHaveBeenCalledWith('social.editHandle.success')
  })

  it('rejects an invalid handle without calling the mutation', () => {
    render(<SocialIdentityBar />)

    fireEvent.click(screen.getByLabelText('social.identity.editAria'))

    fireEvent.change(screen.getByLabelText('social.editHandle.label'), {
      target: { value: 'ab' },
    })
    fireEvent.click(screen.getByText('common.save'))

    expect(mocks.setHandleMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('social.editHandle.hint')
  })
})
