'use client'

import * as Primitive from '@radix-ui/react-slider'
import type { SliderProps } from '@orbit/shared/contracts/forms'
import { questionSliderTick, questionSliderValueAtTick } from '@orbit/shared/types/question-block'

export function Slider({ label, value, valueText, min, max, step, disabled, onChange }: Readonly<SliderProps>) {
  const tickCount = questionSliderTick(max, min, step)
  const tick = questionSliderTick(value ?? min, min, step)
  const select = (next: number) => onChange(questionSliderValueAtTick(min, step, next))
  return <Primitive.Root disabled={disabled} min={0} max={tickCount} step={1} value={[tick]}
    onValueChange={values => select(values[0]!)} onPointerUp={() => { if (!disabled) select(tick) }}
    onKeyDown={event => {
      if (disabled) return
      if (event.key === 'Home') { event.preventDefault(); select(0) }
      if (event.key === 'End') { event.preventDefault(); select(tickCount) }
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); select(tick) }
    }} className="relative flex min-h-[var(--touch-min)] w-full touch-none items-center px-6 data-[disabled]:opacity-60">
    <Primitive.Track className="relative h-1 w-full grow rounded-full bg-[var(--fg-3)]">
      <Primitive.Range className="absolute h-full rounded-full bg-[var(--primary)]" />
    </Primitive.Track>
    <Primitive.Thumb aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value ?? min} aria-valuetext={valueText} aria-disabled={disabled} onKeyDown={event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!disabled) select(tick) }
    }} className="flex size-[var(--touch-min)] items-center justify-center rounded-full transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
      <span aria-hidden="true" className="size-6 rounded-full bg-[var(--primary)]" />
    </Primitive.Thumb>
  </Primitive.Root>
}
