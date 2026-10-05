'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { CheckCheck, SquareX } from '@/components/ui/icons'

interface SelectAllToggleProps {
  allSelected: boolean
  onToggle: () => void
  selectAllLabel: string
  deselectAllLabel: string
}

/** Icon button that selects or deselects every calendar event; its label is both the accessible name and the tooltip. */
export function SelectAllToggle({
  allSelected,
  onToggle,
  selectAllLabel,
  deselectAllLabel,
}: Readonly<SelectAllToggleProps>) {
  const label = allSelected ? deselectAllLabel : selectAllLabel
  return (
    <button
      type="button"
      className="icon-btn touch-target shrink-0"
      style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN }}
      onClick={onToggle}
      aria-pressed={allSelected}
      aria-label={label}
      title={label}
    >
      {allSelected ? (
        <SquareX size={20} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      ) : (
        <CheckCheck size={20} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      )}
    </button>
  )
}
