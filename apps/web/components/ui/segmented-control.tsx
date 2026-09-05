'use client'

import type { KeyboardEvent } from 'react'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'

function nextEnabledIndex<TValue extends string>(
  props: Readonly<SegmentedControlProps<TValue>>,
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

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const selectedIndex = props.options.findIndex((option) => option.value === props.value && !option.disabled)
  const tabbableIndex = selectedIndex < 0 ? props.options.findIndex((option) => !option.disabled) : selectedIndex

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (props.disabled || props.options[index]?.disabled) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = nextEnabledIndex(props, index, event.key === 'ArrowLeft' ? -1 : 1)
    const nextOption = props.options[nextIndex]
    if (!nextOption || nextOption.value === props.value) return
    props.onChange(nextOption.value)
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
        const selected = option.value === props.value
        const disabled = props.disabled || option.disabled
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-selected={selected || undefined}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => {
              if (!selected) props.onChange(option.value)
            }}
            onKeyDown={(event) => moveSelection(event, index)}
            data-disabled={disabled || undefined}
            className="habit-control-motion min-h-11 min-w-0 rounded-[8px] px-3 text-[14px] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] data-[selected]:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-40"
          >
            <span className="block truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
