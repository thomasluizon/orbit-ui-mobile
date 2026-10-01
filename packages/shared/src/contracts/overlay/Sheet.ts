
/** A visible sheet. A closed sheet is unmounted, so `false` is not representable. */
export interface SheetProps {
  open?: true
  title?: string
  accessibleTitle?: string
  headerAccessory?: React.ReactNode
  actions?: React.ReactNode
  /** Reduces the body's horizontal inset when fixed-size controls need more room. */
  minimumBodyWidth?: number
  /** Keeps bounded picker controls within the space left by the header and footer. */
  boundedBody?: boolean
  onClose?: () => void
  /** Receives dismissal attempts while the host blocks closing. */
  onAttemptDismiss?: () => void
  children?: React.ReactNode
}
