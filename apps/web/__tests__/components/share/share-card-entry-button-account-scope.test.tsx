import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ onClick, title }: { onClick: () => void; title: string }) =>
    <button onClick={onClick}>{title}</button>,
}))
vi.mock('@/components/share/share-card-panel', () => ({
  ShareCardPanel: ({ open }: { open: boolean }) => open ? <div>shareCard.title</div> : null,
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
  expect(screen.getByText('shareCard.title')).toBeInTheDocument()

  await replaceAccountWith('user-2')

  expect(screen.queryByText('shareCard.title')).not.toBeInTheDocument()
})

it('keeps the share sheet open through same-account recovery', async () => {
  render(<ShareCardEntryButton />)
  fireEvent.click(screen.getByRole('button', { name: 'shareCard.entry' }))

  await recoverSameAccount('user-1')

  expect(screen.getByText('shareCard.title')).toBeInTheDocument()
})
