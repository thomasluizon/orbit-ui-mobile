import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const mockUpdateName = vi.fn()

vi.mock('@/lib/actions/profile', () => ({
  updateName: (...args: unknown[]) => mockUpdateName(...args),
}))

const mockPatchProfile = vi.fn()
const mockInvalidate = vi.fn()
let mockProfileName = 'Thomas'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { name: mockProfileName },
    patchProfile: mockPatchProfile,
    invalidate: mockInvalidate,
  }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { EditNameSheet } from '@/app/(app)/profile/_components/edit-name-sheet'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

function renderSheet(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EditNameSheet open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
  return onOpenChange
}

describe('EditNameSheet', () => {
  beforeEach(() => {
    mockUpdateName.mockReset()
    mockPatchProfile.mockReset()
    mockInvalidate.mockReset()
    mockProfileName = 'Thomas'
  })

  it('seeds the field with the current profile name', () => {
    renderSheet()

    expect(screen.getByDisplayValue('Thomas')).toBeInTheDocument()
  })

  it('shows the required error and skips the action for a whitespace-only name', () => {
    renderSheet()

    fireEvent.change(screen.getByDisplayValue('Thomas'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('common.save'))

    expect(screen.getByRole('alert')).toHaveTextContent('profile.editName.required')
    expect(mockUpdateName).not.toHaveBeenCalled()
  })

  it('shows the tooLong error and skips the action for a 51-character name', () => {
    renderSheet()

    fireEvent.change(screen.getByDisplayValue('Thomas'), {
      target: { value: 'a'.repeat(51) },
    })
    fireEvent.click(screen.getByText('common.save'))

    expect(screen.getByRole('alert')).toHaveTextContent('profile.editName.tooLong')
    expect(mockUpdateName).not.toHaveBeenCalled()
  })

  it('saves a valid name trimmed, patches optimistically, and closes', async () => {
    mockUpdateName.mockResolvedValue(undefined)
    const onOpenChange = renderSheet()

    fireEvent.change(screen.getByDisplayValue('Thomas'), {
      target: { value: '  Ana Clara  ' },
    })
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockUpdateName).toHaveBeenCalledWith({ name: 'Ana Clara' })
    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Ana Clara' })
    expect(mockInvalidate).toHaveBeenCalled()
  })

  it('restores the previous name and shows an error when the server rejects', async () => {
    mockUpdateName.mockRejectedValue(new Error('boom'))
    const onOpenChange = renderSheet()

    fireEvent.change(screen.getByDisplayValue('Thomas'), {
      target: { value: 'Ana Clara' },
    })
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Ana Clara' })
    expect(mockPatchProfile).toHaveBeenCalledWith({ name: 'Thomas' })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe('EditNameSheet across an account change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockProfileName = 'Thomas'
    holdAccount('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function typeANewName() {
    renderSheet()
    fireEvent.change(screen.getByDisplayValue('Thomas'), { target: { value: 'Ana Clara' } })
    expect(screen.getByDisplayValue('Ana Clara')).toBeInTheDocument()
  }

  it('drops the name typed by the previous account when another replaces the tab', async () => {
    typeANewName()
    mockProfileName = ''

    await replaceAccountWith('user-2')

    expect(screen.queryByDisplayValue('Ana Clara')).not.toBeInTheDocument()
  })

  it('keeps the typed name when the same account recovers from a rejected refresh', async () => {
    typeANewName()

    await recoverSameAccount('user-1')

    expect(screen.getByDisplayValue('Ana Clara')).toBeInTheDocument()
  })
})
