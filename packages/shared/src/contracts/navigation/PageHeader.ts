export interface PageHeaderProps {
  title: string
  titleTranslate?: 'no'
  backLabel: string
  onBack: () => void
  action?: React.ReactNode
  footer?: React.ReactNode
  refreshKey?: string
}
