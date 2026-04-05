'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from './query-client'
import type { ReactNode } from 'react'

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
