'use client'

import type { ComponentProps } from 'react'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { PillButton as Button } from '@/components/ui/pill-button'

type IconButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'iconOnly' | 'size' | 'minimumHeight' | 'variant' | 'borderless' | 'leadingIcon' | 'accessibleName' | 'label' | 'brand'> & {
  label: string
  children: React.ReactElement
}

export function IconButton({ label, children, ...props }: Readonly<IconButtonProps>) {
  return <Button {...props} iconOnly label={label} title={label} variant="ghost" size="sm" minimumHeight={TOUCH_TARGET_MIN} borderless>{children}</Button>
}
