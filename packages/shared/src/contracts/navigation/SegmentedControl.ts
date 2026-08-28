export interface SegmentedOption {
  id: string
  label: string
  disabled?: boolean
}

export type SegmentedOptions =
  | readonly [SegmentedOption, SegmentedOption]
  | readonly [SegmentedOption, SegmentedOption, SegmentedOption]
  | readonly [SegmentedOption, SegmentedOption, SegmentedOption, SegmentedOption]

export interface SegmentedControlProps {
  options: SegmentedOptions
  value: string
  onChange: (id: string) => void
  label: string
  disabled?: boolean
}
