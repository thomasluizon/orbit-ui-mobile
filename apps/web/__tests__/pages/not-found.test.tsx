import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NotFound from '@/app/not-found'
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
it('returns a missing page to Today', () => {
  render(<NotFound />)
  expect(screen.getByRole('heading')).toHaveTextContent('notFoundPage.title')
  fireEvent.click(screen.getByRole('button', { name: 'notFoundPage.action' }))
  expect(push).toHaveBeenCalledWith('/')
})
