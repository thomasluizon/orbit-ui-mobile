export interface PageHeaderProps {
  title: string
  titleTranslate?: 'no'
  /** False draws the title as plain text, for a page whose question is its heading. Default true. */
  titleHeading?: boolean
  backLabel: string
  onBack: () => void
  action?: React.ReactNode
  footer?: React.ReactNode
  refreshKey?: string
}
