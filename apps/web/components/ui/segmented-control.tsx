'use client'

import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
  fullWidth,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  fullWidth: boolean
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
      className={`orbit-selection-ring habit-control-motion ${fullWidth ? 'min-h-12 px-1' : 'min-h-[var(--touch-min)] px-3'} min-w-0 rounded-[8px] text-[0.875rem] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] disabled:opacity-40`}
    >
      <span className={`block ${fullWidth ? 'whitespace-nowrap' : 'whitespace-normal'}`}>{option.label}</span>
    </button>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  return (
    <RadioGroup
      style={props.fullWidth ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, max(calc((100% - ${(props.options.length - 1) * 4}px) / ${props.options.length}), calc(4em + 0.5rem))), 1fr))`, fontSize: '0.875rem' } : { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8em), 1fr))', width: `calc(${props.options.length * 8}em + ${(props.options.length - 1) * 4 + 8}px)`, fontSize: '0.875rem' }}
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className={`${props.fullWidth ? 'grid w-full' : 'inline-grid'} gap-1 p-1 max-w-full rounded-[12px] bg-[var(--bg-well)]`}
    >
      {props.options.map((option) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
          fullWidth={Boolean(props.fullWidth)}
        />
      ))}
    </RadioGroup>
  )
}
