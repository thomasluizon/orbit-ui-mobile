import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotFound from '@/app/not-found'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
it('exposes the Today destination as a keyboard accessible link', async () => {
  const user = userEvent.setup()
  render(<NotFound />)
  expect(screen.getByRole('heading')).toHaveTextContent('notFoundPage.title')
  const link = screen.getByRole('link', { name: 'notFoundPage.action' })
  expect(link).toHaveAttribute('href', '/')
  const activate = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', activate)
  await user.tab()
  expect(link).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(activate).toHaveBeenCalledOnce()
})
