'use client'

import { useEffect } from 'react'
import { useConfig } from '@/hooks/use-config'
import { useFlag } from '@/hooks/use-flag'
import { disableRedesignCookie } from '@/lib/design-cookie'

export function DesignCookieSync(): null {
  const enabled = useFlag('redesign')
  const { resolvedConfig } = useConfig()

  useEffect(() => {
    if (resolvedConfig !== undefined && !enabled) disableRedesignCookie()
  }, [enabled, resolvedConfig])

  return null
}
