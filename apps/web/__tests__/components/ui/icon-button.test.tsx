import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'

describe('IconButton', () => {
  it.each(['Refresh', 'Atualizar'])('names and hints the icon without visible text: %s', (label) => {
    const onClick = vi.fn()
    const { rerender } = render(<IconButton label={label} onClick={onClick}><RefreshCw /></IconButton>)
    const button = screen.getByRole('button', { name: label })
    expect(button.textContent).toBe('')
    expect(button).toHaveAttribute('title', label)
    expect(button).toHaveStyle({ width: '44px', minHeight: '44px' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<IconButton label={label} onClick={onClick} loading><RefreshCw /></IconButton>)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('moves only a start-edge paint back by the glyph inset', () => {
    const { rerender } = render(<IconButton label="Clear" onClick={vi.fn()}><RefreshCw size={20} /></IconButton>)
    const button = screen.getByRole('button', { name: 'Clear' })
    expect(button.style.marginInlineStart).toBe('')
    rerender(<IconButton edge="start" label="Clear" onClick={vi.fn()}><RefreshCw size={20} /></IconButton>)
    expect(button).toHaveStyle({ width: '44px', minHeight: '44px', marginInlineStart: `${-(44 - 20) / 2}px` })
  })
})
