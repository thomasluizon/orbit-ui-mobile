import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ onClick, title }: { onClick: () => void; title: string }) =>
    <button onClick={onClick}>{title}</button>,
}))
vi.mock('@/hooks/use-recap', () => ({
  useRecap: () => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null }, isSharing: false, hasError: false,
    canShareFiles: false, share: vi.fn(), download: vi.fn(),
  }),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <section data-testid="share-card-sheet">{children}</section> : null,
}))

import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
})

afterEach(() => { vi.unstubAllGlobals() })

it('closes the previous account share sheet on replacement', async () => {
  render(<ShareCardEntryButton />)
  fireEvent.click(screen.getByRole('button', { name: 'shareCard.entry' }))
  expect(screen.getByTestId('share-card-sheet')).toBeInTheDocument()

  await replaceAccountWith('user-2')

  expect(screen.queryByTestId('share-card-sheet')).not.toBeInTheDocument()
})

it('keeps the share sheet open through same-account recovery', async () => {
  render(<ShareCardEntryButton />)
  fireEvent.click(screen.getByRole('button', { name: 'shareCard.entry' }))

  await recoverSameAccount('user-1')

  expect(screen.getByTestId('share-card-sheet')).toBeInTheDocument()
})
