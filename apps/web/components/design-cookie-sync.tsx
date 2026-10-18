'use client'

import { useEffect } from 'react'
import { useConfig } from '@/hooks/use-config'
import { useFlag } from '@/hooks/use-flag'
import { enableRedesignCookie } from '@/lib/design-cookie'

export function DesignCookieSync(): null {
  const enabled = useFlag('redesign')
  const { resolvedConfig } = useConfig()

  useEffect(() => {
    if (enabled) enableRedesignCookie()
  }, [enabled, resolvedConfig])

  return null
}
