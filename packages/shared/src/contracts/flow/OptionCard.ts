/** A quick option: one answer in the person's words, at most four words, on one line at 320. Selection takes the current-position ring in `--primary`; the `--fg-1` ring belongs to focus. */
export interface OptionCardProps {
  label: string
  selected?: boolean
  disabled?: boolean
  /** Text beside a disabled option that says why. A disabled option without a reason is not allowed. */
  disabledReason?: string
  /** Answers and, on a single-choice step, advances in one press. */
  onSelect: () => void
  /** Reports pointer or keyboard focus on the option, so Orbit can look at it. */
  onHighlight?: (highlighted: boolean) => void
}
