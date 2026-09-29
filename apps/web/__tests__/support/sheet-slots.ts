import { within } from '@testing-library/react'

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
