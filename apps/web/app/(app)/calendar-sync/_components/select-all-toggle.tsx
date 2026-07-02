'use client'

import { CheckCheck, SquareX } from 'lucide-react'

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
      style={{ width: 36, height: 36 }}
      onClick={onToggle}
      aria-pressed={allSelected}
      aria-label={label}
      title={label}
    >
      {allSelected ? (
        <SquareX size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      ) : (
        <CheckCheck size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      )}
    </button>
  )
}
