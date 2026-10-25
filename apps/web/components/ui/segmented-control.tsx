'use client'

import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import * as Primitive from '@radix-ui/react-radio-group'
import { useRef } from 'react'

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

  return (
    <Primitive.Item value={option.value}
      type="button"
      disabled={disabled}
      tabIndex={selected && !disabled ? 0 : -1}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.click() } }}
      data-selected={selected || undefined}
      onClick={(event) => { if (event.detail === 0) select() }}
      data-disabled={disabled || undefined}
      className="orbit-selection-ring habit-control-motion min-h-[var(--touch-min)] min-w-[var(--touch-min)] max-w-full grow shrink basis-auto px-2 py-1 rounded-[8px] text-[0.875rem] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:bg-[var(--bg-hover)] data-[selected]:text-[var(--fg-1)] disabled:opacity-40"
    >
      <span className="block whitespace-normal [overflow-wrap:anywhere]">{option.label}</span>
    </Primitive.Item>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const pendingValue = useRef<string | null>(null)
  const navigationKey = useRef('')
  const changeSelection = (value: string) => {
      const option = props.options.find((candidate) => candidate.value === value && !candidate.disabled)
      if (option && !props.disabled && option.value !== props.value && pendingValue.current !== value) {
        pendingValue.current = value
        queueMicrotask(() => { pendingValue.current = null })
        props.onChange(option.value)
      }
    }
  return (
    <Primitive.Root value={props.value} onValueChange={changeSelection} disabled={props.disabled} tabIndex={-1} loop
      onKeyDown={(event) => {
        navigationKey.current = event.key
        setTimeout(() => { navigationKey.current = '' }, 0)
      }}
      onPointerDownCapture={() => { navigationKey.current = '' }}
      onFocus={(event) => {
        const key = navigationKey.current
        navigationKey.current = ''
        if (event.target !== event.currentTarget && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) event.target.click()
      }}
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className={`${props.fullWidth ? 'flex w-full' : 'inline-flex'} flex-nowrap gap-[4px] p-1 max-w-full rounded-[12px] bg-[var(--bg-well)]`}
    >
      {props.options.map((option) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={changeSelection}
          option={option}
          selected={option.value === props.value}
        />
      ))}
    </Primitive.Root>
  )
}
