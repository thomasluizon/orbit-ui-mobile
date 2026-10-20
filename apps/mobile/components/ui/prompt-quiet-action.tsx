import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { PillButton } from '@/components/ui/pill-button'

export function PromptQuietAction(props: Readonly<Pick<ButtonProps, 'onClick' | 'disabled' | 'accessibleName'> & { children: string }>) {
  return <PillButton {...props} size="sm" variant="ghost" quiet />
}
