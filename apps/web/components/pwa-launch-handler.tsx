'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type LaunchWindow = Window & {
  launchQueue?: {
    setConsumer: (consumer: (parameters: { targetURL: string }) => void) => void
  }
}

export function PwaLaunchHandler() {
  const router = useRouter()
  useEffect(() => {
    const queue = (window as LaunchWindow).launchQueue
    if (!queue) return
    let active = true
    queue.setConsumer(({ targetURL }) => {
      if (!active || !targetURL) return
      let target: URL
      try {
        target = new URL(targetURL)
      } catch {
        return
      }
      if (target.origin !== window.location.origin || target.username || target.password) return
      if (target.pathname.startsWith('//')) return
      router.push(`${target.pathname}${target.search}${target.hash}`)
    })
    return () => { active = false }
  }, [router])
  return null
}
