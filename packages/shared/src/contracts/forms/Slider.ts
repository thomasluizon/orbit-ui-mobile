export interface SliderProps {
  readonly label: string
  readonly value?: number
  readonly valueText: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly disabled?: boolean
  readonly onChange: (value: number) => void
}
