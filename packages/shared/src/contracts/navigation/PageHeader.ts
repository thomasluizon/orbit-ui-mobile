export interface PageHeaderProps {
  title: string
  backLabel: string
  onBack: () => void
  action?: React.ReactNode
  footer?: React.ReactNode
  refreshKey?: string
}
