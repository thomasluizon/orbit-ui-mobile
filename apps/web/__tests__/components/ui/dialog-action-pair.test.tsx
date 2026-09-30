import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'

describe('DialogActionPair (web)', () => {
  it.each([false, true])('keeps intrinsic actions trailing with inline=%s', (inline) => {
    render(<DialogActionPair inline={inline}><button type="button">Cancel</button><button type="button">Confirm</button></DialogActionPair>)
    const pair = screen.getByRole('button', { name: 'Confirm' }).parentElement!

    expect(pair).toHaveAttribute('data-slot', 'dialog-action-pair')
    expect(pair.style.flexDirection).toBe('row')
    expect(pair.style.justifyContent).toBe('flex-end')
    expect(pair.style.alignItems).toBe('center')
    expect(pair.style.maxWidth).toBe('')
    expect(pair.style.width).toBe('')
    expect(pair.style.marginInline).toBe('')
  })
})
