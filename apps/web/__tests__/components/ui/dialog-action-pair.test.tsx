import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MATCHED_PILL_MAX_WIDTH } from '@orbit/shared/theme'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'

describe('DialogActionPair (web)', () => {
  it('centres the capped stack in the right-aligned sheet footer', () => {
    render(<DialogActionPair><button type="button">Confirm</button></DialogActionPair>)
    const pair = screen.getByRole('button', { name: 'Confirm' }).parentElement!

    expect(pair).toHaveAttribute('data-slot', 'dialog-action-pair')
    expect(pair.className.split(' ')).toEqual(expect.arrayContaining(['mx-auto', 'w-full', 'flex-col']))
    expect(pair.style.maxWidth).toBe(`${MATCHED_PILL_MAX_WIDTH}px`)
  })
})
