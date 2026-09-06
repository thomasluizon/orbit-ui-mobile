export type SegmentedControlOption<TValue extends string> = {
  value: TValue
  label: string
  disabled?: boolean
}

export type SegmentedControlProps<TValue extends string> = {
  options:
    | readonly [SegmentedControlOption<TValue>, SegmentedControlOption<TValue>]
    | readonly [SegmentedControlOption<TValue>, SegmentedControlOption<TValue>, SegmentedControlOption<TValue>]
    | readonly [SegmentedControlOption<TValue>, SegmentedControlOption<TValue>, SegmentedControlOption<TValue>, SegmentedControlOption<TValue>]
  value: NoInfer<TValue>
  onChange: (value: NoInfer<TValue>) => void
  label: string
  disabled?: boolean
}
