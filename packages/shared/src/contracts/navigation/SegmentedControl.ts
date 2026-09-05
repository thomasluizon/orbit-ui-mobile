export type SegmentedControlOption<TValue extends string> = {
  value: TValue
  label: string
  disabled?: boolean
}

export type SegmentedControlProps<TValue extends string> = {
  options: readonly SegmentedControlOption<TValue>[]
  value: NoInfer<TValue>
  onChange: (value: NoInfer<TValue>) => void
  label: string
  disabled?: boolean
}
