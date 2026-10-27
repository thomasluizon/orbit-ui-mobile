'use client'

import * as Primitive from '@radix-ui/react-slider'
import type { SliderProps } from '@orbit/shared/contracts/forms'
import { questionSliderValue } from '@orbit/shared/types/question-block'

export function Slider({ label, value, valueText, min, max, step, disabled, onChange }: Readonly<SliderProps>) {
  const select = (next: number) => onChange(questionSliderValue(min, max, step, (next - min) / (max - min)))
  return <Primitive.Root disabled={disabled} min={min} max={max} step={step} value={[value ?? min]}
    onValueChange={values => select(values[0]!)} onPointerUp={() => { if (!disabled) select(value ?? min) }}
    onKeyDown={event => {
      if (disabled) return
      if (event.key === 'Home') select(min)
      if (event.key === 'End') select(max)
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); select(value ?? min) }
    }} className="relative flex min-h-[var(--touch-min)] w-full touch-none items-center px-6 data-[disabled]:opacity-60">
    <Primitive.Track className="relative h-1 w-full grow rounded-full bg-[var(--fg-3)]">
      <Primitive.Range className="absolute h-full rounded-full bg-[var(--primary)]" />
    </Primitive.Track>
    <Primitive.Thumb aria-label={label} aria-valuetext={valueText} aria-disabled={disabled} onKeyDown={event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!disabled) select(value ?? min) }
    }} className="flex size-[var(--touch-min)] items-center justify-center rounded-full transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
      <span aria-hidden="true" className="size-6 rounded-full bg-[var(--primary)]" />
    </Primitive.Thumb>
  </Primitive.Root>
}
