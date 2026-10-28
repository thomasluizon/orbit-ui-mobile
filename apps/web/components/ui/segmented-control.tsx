'use client'

import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import * as Primitive from '@radix-ui/react-radio-group'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import * as Menu from './dropdown-menu'
import { ChevronDown } from './icons'
import { getSegmentedControlLayout } from '@orbit/shared/utils'

import { SelectionIndicator } from './selection-indicator'

const segmentPadding = 'px-2'
const trackSpacing = 'gap-[4px] p-1'

function inlinePadding(style: CSSStyleDeclaration) {
  return Number(style.paddingLeft.replace('px', '')) + Number(style.paddingRight.replace('px', ''))
}

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
  minimumWidth,
  indicatorId,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  minimumWidth: number
  indicatorId: string
}>) {
  const disabled = controlDisabled || Boolean(option.disabled)
  const select = () => {
    if (!selected) onChange(option.value)
  }

  return (
    <Primitive.Item style={{ minWidth: minimumWidth }} value={option.value}
      type="button"
      disabled={disabled}
      tabIndex={selected && !disabled ? 0 : -1}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.click() } }}
      data-selected={selected || undefined}
      onClick={(event) => { if (event.detail === 0) select() }}
      data-disabled={disabled || undefined}
      className={`${segmentPadding} orbit-selection-ring habit-control-motion isolate relative min-h-[var(--touch-min)] min-w-[var(--touch-min)] max-w-full grow shrink basis-auto py-1 rounded-[8px] text-[0.875rem] font-medium text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] data-[selected]:text-[var(--fg-1)] disabled:opacity-40`}
    >
      <span className="relative block whitespace-normal [overflow-wrap:normal]">{option.label}</span>
      {selected ? <SelectionIndicator id={indicatorId} /> : null}
    </Primitive.Item>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const indicatorId = useId()
  const pendingValue = useRef<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ folded: boolean; minimumWidths: number[] }>({ folded: false, minimumWidths: [] })
  const labels = JSON.stringify(props.options.map((option) => option.label))
  useLayoutEffect(() => {
    const frame = frameRef.current!
    const measure = () => {
      const measuredLabels = [...frame.querySelectorAll<HTMLElement>('[data-segment-measure]')]
      const trackStyle = getComputedStyle(measuredLabels[0]!.parentElement!)
      const segmentStyle = getComputedStyle(measuredLabels[0]!)
      const wordWidths = measuredLabels.map((label) => {
        const largeText = Number.parseFloat(getComputedStyle(label).fontSize) > 14 * 1.3
        const words = label.querySelectorAll<HTMLElement>(largeText ? '[data-segment-word]' : '[data-segment-full]')
        return [...words].map((word) => word.getBoundingClientRect().width)
      })
      const next = getSegmentedControlLayout(wordWidths, frame.getBoundingClientRect().width, {
        label: inlinePadding(segmentStyle), track: inlinePadding(trackStyle), gap: trackStyle.columnGap === 'normal' ? 0 : Number(trackStyle.columnGap.replace('px', '')),
      })
      setLayout((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    frame.querySelectorAll('[data-segment-measure] > span').forEach((word) => observer.observe(word))
    measure()
    return () => observer.disconnect()
  }, [labels])
  const changeSelection = (value: string) => {
      const option = props.options.find((candidate) => candidate.value === value && !candidate.disabled)
      if (option && !props.disabled && option.value !== props.value && pendingValue.current !== value) {
        pendingValue.current = value
        queueMicrotask(() => { pendingValue.current = null })
        props.onChange(option.value)
      }
    }
  const { folded, minimumWidths } = layout
  const selected = props.options.find((option) => option.value === props.value)!
  return (
    <div ref={frameRef} data-segmented-control="" className="relative w-full min-w-0 max-w-full">
      <div aria-hidden="true" className={`${trackSpacing} pointer-events-none invisible absolute inset-x-0 top-0 flex h-0 overflow-hidden text-[0.875rem] font-medium`}>
        {props.options.map((option) => <span key={option.value} data-segment-measure="" className={`${segmentPadding} flex shrink-0`}>
          <span data-segment-full="" className="whitespace-nowrap">{option.label}</span>
          {option.label.split(/\s+/).map((word, index) => <span key={index} data-segment-word="" className="whitespace-nowrap">{word}</span>)}
        </span>)}
      </div>
      {folded ? <Menu.Root>
        <Menu.Trigger disabled={props.disabled} aria-label={`${props.label}: ${selected.label}`}
          className="orbit-selection-ring habit-control-motion flex w-full min-h-[var(--touch-min)] items-center justify-between gap-2 rounded-[12px] bg-[var(--bg-well)] px-3 py-2 text-[0.875rem] font-medium text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-40">
          <span className="min-w-0 whitespace-normal [overflow-wrap:normal]">{selected.label}</span><ChevronDown size={20} aria-hidden="true" className="shrink-0" />
        </Menu.Trigger>
        <Menu.Content title={props.label} items={props.options.map((option) => ({ id: option.value, label: option.label, checked: option.value === props.value, disabled: props.disabled || option.disabled }))} onSelect={changeSelection} />
      </Menu.Root> : <Primitive.Root value={props.value} onValueChange={changeSelection} disabled={props.disabled} tabIndex={-1} loop
      onKeyDownCapture={(event) => {
        if (props.disabled) return
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        const enabledOptions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)'))
        const currentIndex = enabledOptions.findIndex((option) => option === event.currentTarget.ownerDocument.activeElement)
        if (currentIndex < 0) return
        let destinationIndex = 0
        if (event.key === 'End') destinationIndex = enabledOptions.length - 1
        else if (event.key !== 'Home') {
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
          destinationIndex = (currentIndex + direction + enabledOptions.length) % enabledOptions.length
        }
        const destination = enabledOptions[destinationIndex]!
        destination.focus()
        changeSelection(destination.value)
        event.preventDefault()
      }}
      aria-label={props.label}
      aria-disabled={props.disabled || undefined}
      data-disabled={props.disabled || undefined}
      className={`${props.fullWidth ? 'flex w-full' : 'inline-flex'} ${trackSpacing} flex-nowrap max-w-full rounded-[12px] bg-[var(--bg-well)]`}
    >
      {props.options.map((option, index) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={changeSelection}
          option={option}
          selected={option.value === props.value}
          minimumWidth={minimumWidths[index] ?? 48}
          indicatorId={indicatorId}
        />
      ))}
    </Primitive.Root>}
    </div>
  )
}
