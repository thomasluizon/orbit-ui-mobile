import { render, screen } from '@testing-library/react'
import { afterAll, expect, it, vi } from 'vitest'
import { Sheet } from '@/components/ui/sheet'

const { toastPrefetched } = vi.hoisted(() => ({ toastPrefetched: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-toast-lifecycle', async (importOriginal) => {
  const lifecycleModule = await importOriginal<typeof import('@/hooks/use-toast-lifecycle')>()
  toastPrefetched()
  return lifecycleModule
})

afterAll(() => {
  expect(toastPrefetched).toHaveBeenCalledOnce()
})

it('settles the real Sheet toast prefetch before suite teardown without a consumer await', () => {
  render(<Sheet title="Options" onClose={vi.fn()}><input aria-label="Sheet field" /></Sheet>)
  expect(screen.getByRole('dialog', { name: 'Options' })).toBeInTheDocument()
})
