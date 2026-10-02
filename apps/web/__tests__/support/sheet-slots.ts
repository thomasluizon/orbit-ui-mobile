import { within } from '@testing-library/react'
import { expect } from 'vitest'

/**
 * Names every button an open sheet renders in one slot, in order: the body scrolls,
 * the actions slot is the pinned footer. Both the real sheet and the sheet double
 * mark the two slots with `data-slot`.
 */
export function sheetSlotButtons(slot: 'sheet-body' | 'sheet-actions'): (string | null)[] {
  const container = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
  if (!container) throw new Error(`Expected the ${slot} slot`)
  return within(container).queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)
}

/** Whether the footer groups its actions in `ActionRow`. */
export function sheetActionsUseActionPair(): boolean {
  return document.querySelectorAll('[data-slot="sheet-actions"] [data-slot="action-row"]').length > 0
}

export function expectSmallSheetActions(): void {
  const footer = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
  const buttons = within(footer).getAllByRole('button')
  for (const button of buttons) {
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button.style.width).toBe('')
  }
  if (buttons.length > 1) {
    expect(buttons[0]).toHaveAttribute('data-variant', 'ghost')
    expect(buttons.at(-1)).not.toHaveAttribute('data-variant', 'ghost')
  }
}
