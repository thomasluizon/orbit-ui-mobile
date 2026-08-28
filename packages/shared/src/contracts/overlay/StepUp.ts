/** A security handoff. It cannot contain a credential field because it has no node slot. */
export interface StepUpProps {
  message: string
  actionLabel: string
  onAction: () => void
  busy?: boolean
}
