export interface PageHeaderProps {
  title: string
  titleTranslate?: 'no'
  /** `label` when the content of the page holds the `h1`, such as the question of a guided route. Default `heading`. */
  titleRole?: 'heading' | 'label'
  backLabel: string
  onBack: () => void
  action?: React.ReactNode
  footer?: React.ReactNode
  refreshKey?: string
}
