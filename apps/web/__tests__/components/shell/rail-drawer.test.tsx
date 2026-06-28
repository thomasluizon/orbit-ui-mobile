import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

import { RailDrawer } from '@/components/shell/rail-drawer'

function renderDrawer(open: boolean, onClose: () => void = vi.fn()) {
  render(
    <RailDrawer open={open} onClose={onClose}>
      <p>Rail body</p>
    </RailDrawer>,
  )
  return onClose
}

describe('RailDrawer', () => {
  it('renders the rail content when open', () => {
    renderDrawer(true)
    expect(screen.getByText('Rail body')).toBeInTheDocument()
  })

  it('does not render the rail content when closed', () => {
    renderDrawer(false)
    expect(screen.queryByText('Rail body')).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.click(screen.getByLabelText('common.close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
