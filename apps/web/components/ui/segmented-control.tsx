'use client'

import type { KeyboardEvent } from 'react'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'

function nextEnabledIndex(
  props: Readonly<SegmentedControlProps>,
  currentIndex: number,
  direction: -1 | 1,
): number {
  let index = currentIndex
  for (let attempts = 0; attempts < props.options.length; attempts += 1) {
    index = (index + direction + props.options.length) % props.options.length
    if (!props.options[index]?.disabled) return index
  }
  return currentIndex
}

export function SegmentedControl(props: Readonly<SegmentedControlProps>) {
  const selectedIndex = Math.max(
    props.options.findIndex((option) => option.id === props.value),
    0,
  )

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = nextEnabledIndex(props, index, event.key === 'ArrowLeft' ? -1 : 1)
    const nextOption = props.options[nextIndex]
    if (!nextOption || nextOption.id === props.value) return
    props.onChange(nextOption.id)
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(nextIndex)
      .focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className="inline-flex max-w-full gap-1 rounded-[12px] bg-[var(--bg-field)] p-1 shadow-[inset_0_0_0_1px_var(--border-control)]"
    >
      {props.options.map((option, index) => {
        const selected = option.id === props.value
        const disabled = props.disabled || option.disabled
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-selected={selected || undefined}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => {
              if (!selected) props.onChange(option.id)
            }}
            onKeyDown={(event) => moveSelection(event, index)}
            className="habit-control-motion min-h-11 min-w-0 rounded-[8px] px-3 text-[14px] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] data-[selected]:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-40"
          >
            <span className="block truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
