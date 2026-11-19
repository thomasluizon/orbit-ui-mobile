/** The result dialog: a flow that creates or changes a record closes with it. It is centred at every width and asks nothing. */
export interface ResultDialogProps {
  title: string
  /** One sentence, built from the saved record. */
  sentence: string
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  /** Escape, a scrim press and Android back. The dialog never dismisses itself. */
  onClose: () => void
  /** Feliz after something was created or finished. Parado after a destructive flow, with no hop. */
  orbitState?: 'feliz' | 'parado'
}
