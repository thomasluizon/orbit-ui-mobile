'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { resolveConversationMotion } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function useConversationMotion(index = 0) {
  return resolveConversationMotion(useViewportMatch('(prefers-reduced-motion: reduce)'), index)
}

export function ConversationReveal({ children, animate = false, index = 0, className }: Readonly<{
  children: ReactNode
  animate?: boolean
  index?: number
  className?: string
}>) {
  const configuration = useConversationMotion(index)
  const controls = useAnimationControls()
  useEffect(() => {
    if (configuration.duration === 0) {
      controls.stop()
      controls.set({ opacity: 1, y: 0 })
    } else void controls.start({ opacity: 1, y: 0, transition: { duration: configuration.duration / 1000, delay: configuration.delay / 1000, ease: configuration.easing } })
    return () => controls.stop()
  }, [configuration.delay, configuration.duration, configuration.easing, controls])
  return <motion.div data-conversation-reveal="" data-motion-delay={configuration.delay} className={className}
    initial={animate && configuration.duration > 0 ? { opacity: 0.6, y: configuration.shift } : false}
    animate={controls}>
    {children}
  </motion.div>
}

export function ConversationChange({ children, changeKey, className }: Readonly<{
  children?: ReactNode
  changeKey: string
  className?: string
}>) {
  const configuration = useConversationMotion()
  const controls = useAnimationControls()
  const previous = useRef(changeKey)
  useEffect(() => {
    controls.stop()
    if (previous.current !== changeKey && configuration.changeDuration > 0) {
      controls.set({ opacity: 0.6 })
      void controls.start({ opacity: 1, transition: { duration: configuration.changeDuration / 1000, ease: configuration.easing } })
    } else controls.set({ opacity: 1 })
    previous.current = changeKey
    return () => controls.stop()
  }, [changeKey, configuration.changeDuration, configuration.easing, controls])
  return <motion.div data-conversation-change="" className={className} initial={false} animate={controls}>{children}</motion.div>
}
