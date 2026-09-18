'use client'

import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
}>) {
  const disabled = controlDisabled || Boolean(option.disabled)
  const select = () => {
    if (!selected) onChange(option.value)
  }
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled, onSelect: select, selected })

  return (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      data-selected={selected || undefined}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      data-disabled={disabled || undefined}
      className="habit-control-motion min-h-11 min-w-0 rounded-[8px] px-3 text-[14px] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] data-[selected]:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-40"
    >
      <span className="block truncate">{option.label}</span>
    </button>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  return (
    <RadioGroup
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className="inline-flex max-w-full gap-1 rounded-[12px] bg-[var(--bg-field)] p-1 shadow-[inset_0_0_0_1px_var(--border-control)]"
    >
      {props.options.map((option) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
        />
      ))}
    </RadioGroup>
  )
}
