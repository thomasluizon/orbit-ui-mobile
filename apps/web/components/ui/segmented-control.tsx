'use client'

import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
  wideFill,
  fullWidth,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  wideFill: boolean
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
      className={`habit-control-motion ${fullWidth ? 'min-h-12 px-2' : 'min-h-[var(--touch-min)] px-3'} min-w-0 rounded-[8px] text-[0.875rem] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] data-[selected]:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-40${wideFill ? ' min-[1024px]:flex-1 basis-[8em] grow' : ''}`}
    >
      <span className={`block ${fullWidth ? 'whitespace-nowrap' : 'whitespace-normal'}`}>{option.label}</span>
    </button>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  return (
    <RadioGroup
      style={props.fullWidth ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, max(${100 / props.options.length}%, 5em)), 1fr))`, fontSize: '0.875rem' } : { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8em), 1fr))', width: props.wideFill ? undefined : `calc(${props.options.length * 8}em + ${(props.options.length - 1) * 4 + 8}px)`, fontSize: '0.875rem' }}
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className={`${props.fullWidth ? 'grid w-full' : props.wideFill ? 'inline-flex flex-wrap gap-1 p-1' : 'inline-grid gap-1 p-1'} max-w-full rounded-[12px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--border-control)]${props.wideFill ? ' min-[1024px]:w-full' : ''}`}
    >
      {props.options.map((option) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
          wideFill={Boolean(props.wideFill)}
          fullWidth={Boolean(props.fullWidth)}
        />
      ))}
    </RadioGroup>
  )
}
