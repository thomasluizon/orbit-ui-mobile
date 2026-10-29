import type { ComponentProps } from 'react'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { PillButton as Button, ThemedButton } from '@/components/ui/pill-button'

type IconButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'iconOnly' | 'size' | 'minimumHeight' | 'variant' | 'leadingIcon' | 'accessibleName' | 'label' | 'brand'> & {
  label: string
  children: React.ReactElement
}

export function IconButton({ label, children, borderless = true, ...props }: Readonly<IconButtonProps>) {
  return <Button {...props} iconOnly label={label} variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} borderless={borderless}>{children}</Button>
}

export function ThemedIconButton({ label, children, borderless = true, ...props }: Readonly<IconButtonProps & Pick<ComponentProps<typeof ThemedButton>, 'tokens'>>) {
  return <ThemedButton {...props} iconOnly label={label} variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} borderless={borderless}>{children}</ThemedButton>
}
