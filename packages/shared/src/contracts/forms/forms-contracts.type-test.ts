import type {
  CheckboxProps,
  CheckRowProps,
  DateRowProps,
  InputProps,
  OtpInputProps,
  SwitchProps,
  Time24,
  TimeFieldProps,
} from './index'

type Exact<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type InputBase = { label: 'Name'; value: ''; onChange: (value: string) => void }
type SingleInput = Exact<InputBase & { maxLength: 60 }, InputProps>
type MultilineInput = Exact<InputBase & { multiline: true; rows: 4; maxLength: 60 }, InputProps>
// @ts-expect-error false would create a second single-line shape
type FalseMultiline = Exact<InputBase & { multiline: false }, InputProps>
// @ts-expect-error rows only describe a multiline field
type RowsWithoutMultiline = Exact<InputBase & { rows: 4 }, InputProps>
// @ts-expect-error marks ship with the parser that produces them, not before
type PrematureMarks = Exact<InputBase & { multiline: true; marks: [[0, 3]] }, InputProps>

type OtpBase = { label: 'Code'; value: ''; onChange: (value: string) => void }
type Otp = Exact<OtpBase, OtpInputProps>
// @ts-expect-error a controlled code field requires its change callback
type OtpWithoutChange = Exact<Omit<OtpBase, 'onChange'>, OtpInputProps>
// @ts-expect-error a controlled code field requires its value
type OtpWithoutValue = Exact<Omit<OtpBase, 'value'>, OtpInputProps>
// @ts-expect-error the caller must provide the localized accessible name
type OtpWithoutLabel = Exact<Omit<OtpBase, 'label'>, OtpInputProps>
// @ts-expect-error active cell state is derived from the value
type OtpWithActiveIndex = Exact<OtpBase & { activeIndex: 2 }, OtpInputProps>
// @ts-expect-error the single platform input owns keyboard behavior
type OtpWithKeyHandler = Exact<OtpBase & { onKeyDown: () => void }, OtpInputProps>
// @ts-expect-error the OTP error is one message
type OtpWithBooleanError = Exact<OtpBase & { error: true }, OtpInputProps>

type CheckboxBase = { checked: true; onChange: (checked: boolean) => void }
type LoadingDisabledCheckbox = Exact<
  CheckboxBase & { loading: true; disabled: true },
  CheckboxProps
>
// @ts-expect-error the box carries error state, while its row carries the message
type CheckboxWithMessage = Exact<CheckboxBase & { error: 'Required' }, CheckboxProps>
// @ts-expect-error paint-only checkboxes render as spans
type CheckboxAsDiv = Exact<CheckboxBase & { as: 'div' }, CheckboxProps>

type CheckRowBase = { label: 'Walk'; checked: false; onChange: (checked: boolean) => void }
type CheckRow = Exact<CheckRowBase & { value: 3 }, CheckRowProps>
// @ts-expect-error a checklist row without words is not a state
type CheckRowWithoutLabel = Exact<Omit<CheckRowBase, 'label'>, CheckRowProps>
// @ts-expect-error the row carries an error message
type CheckRowWithBooleanError = Exact<CheckRowBase & { error: true }, CheckRowProps>
// @ts-expect-error trailing values are text or numbers, never arbitrary nodes
type CheckRowWithNodeValue = Exact<CheckRowBase & { value: { badge: true } }, CheckRowProps>

type SwitchBase = { label: 'Reminders'; checked: true; onChange: (checked: boolean) => void }
type Switch = Exact<SwitchBase, SwitchProps>
// @ts-expect-error unavailable state belongs to the surrounding row
type DisabledSwitch = Exact<SwitchBase & { disabled: true }, SwitchProps>
// @ts-expect-error failure belongs to the surrounding form
type ErrorSwitch = Exact<SwitchBase & { error: 'Failed' }, SwitchProps>
// @ts-expect-error loading belongs to the surrounding row
type LoadingSwitch = Exact<SwitchBase & { loading: true }, SwitchProps>
// @ts-expect-error reasons belong in visible surrounding text
type SwitchWithReason = Exact<SwitchBase & { reason: 'Unavailable' }, SwitchProps>

type TimeBase = { label: 'Time'; onChange: (value: Time24) => void }
type MorningTime = Exact<TimeBase & { value: '07:30' }, TimeFieldProps>
type EveningTime = Exact<TimeBase & { value: '19:30'; hourCycle: 'h12' }, TimeFieldProps>
// @ts-expect-error the wire value is zero-padded
type ShortHour = Exact<TimeBase & { value: '7:30' }, TimeFieldProps>
// @ts-expect-error the wire value admits only hours 00 through 23
type InvalidHour = Exact<TimeBase & { value: '25:00' }, TimeFieldProps>
// @ts-expect-error the platform cycle name is h23
type InvalidHourCycle = Exact<TimeBase & { value: '07:30'; hourCycle: 'h24' }, TimeFieldProps>
// @ts-expect-error TimeField accepts minute precision only
type TimeWithStep = Exact<TimeBase & { value: '07:30'; step: 30 }, TimeFieldProps>

type DateRow = Exact<{ label: 'Started'; value: 'August 28, 2026' }, DateRowProps>
// @ts-expect-error a fixed date is not editable
type EditableDateRow = Exact<{ label: 'Started'; value: 'August 28, 2026'; onChange: () => void }, DateRowProps>
// @ts-expect-error a fixed date cannot be disabled
type DisabledDateRow = Exact<{ label: 'Started'; value: 'August 28, 2026'; disabled: true }, DateRowProps>
// @ts-expect-error a fixed date row has no loading state
type LoadingDateRow = Exact<{ label: 'Started'; value: 'August 28, 2026'; loading: true }, DateRowProps>
// @ts-expect-error a fixed date row has no error state
type ErrorDateRow = Exact<{ label: 'Started'; value: 'August 28, 2026'; error: 'Failed' }, DateRowProps>
// @ts-expect-error the visible label is required
type DateRowWithoutLabel = Exact<{ value: 'August 28, 2026' }, DateRowProps>
// @ts-expect-error the already formatted value is required
type DateRowWithoutValue = Exact<{ label: 'Started' }, DateRowProps>
// @ts-expect-error the component receives display text, not a Date
type DateObjectRow = Exact<{ label: 'Started'; value: Date }, DateRowProps>

export type FormContractAssertions =
  | SingleInput
  | MultilineInput
  | FalseMultiline
  | RowsWithoutMultiline
  | PrematureMarks
  | Otp
  | OtpWithoutChange
  | OtpWithoutValue
  | OtpWithoutLabel
  | OtpWithActiveIndex
  | OtpWithKeyHandler
  | OtpWithBooleanError
  | LoadingDisabledCheckbox
  | CheckboxWithMessage
  | CheckboxAsDiv
  | CheckRow
  | CheckRowWithoutLabel
  | CheckRowWithBooleanError
  | CheckRowWithNodeValue
  | Switch
  | DisabledSwitch
  | ErrorSwitch
  | LoadingSwitch
  | SwitchWithReason
  | MorningTime
  | EveningTime
  | ShortHour
  | InvalidHour
  | InvalidHourCycle
  | TimeWithStep
  | DateRow
  | EditableDateRow
  | DisabledDateRow
  | LoadingDateRow
  | ErrorDateRow
  | DateRowWithoutLabel
  | DateRowWithoutValue
  | DateObjectRow
