
/** A visible sheet. A closed sheet is unmounted, so `false` is not representable. */
export interface SheetProps {
  open?: true
  title?: string
  headerAccessory?: React.ReactNode
  actions?: React.ReactNode
  onClose?: () => void
  children?: React.ReactNode
}
