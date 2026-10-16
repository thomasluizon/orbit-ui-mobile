'use client'

import type { ComponentPropsWithRef } from 'react'

export function TypedTextarea({ style, ...props }: Readonly<ComponentPropsWithRef<'textarea'>>) {
  return <textarea {...props} style={{ ...style, color: 'var(--fg-1)' }} />
}
