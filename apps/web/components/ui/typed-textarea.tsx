'use client'

import type { ComponentPropsWithRef } from 'react'

type TypedTextareaProps = ComponentPropsWithRef<'textarea'> & { proposed?: boolean }

export function TypedTextarea({ style, proposed = false, ...props }: Readonly<TypedTextareaProps>) {
  return <textarea {...props} style={{ ...style, color: proposed ? 'var(--fg-3)' : 'var(--fg-1)' }} />
}
