'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import './level-up-overlay.css'

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

export function LevelUpOverlay({ leveledUp, newLevel, onClear }: LevelUpOverlayProps) {
  const t = useTranslations()
  const [visible, setVisible] = useState(false)
  const [level, setLevel] = useState(0)
  const [title, setTitle] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (leveledUp && newLevel) {
      setLevel(newLevel)
      setTitle(t(`gamification.levels.${newLevel}`))
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onClear()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [leveledUp, newLevel, onClear, t])

  if (!mounted || !visible) return null

  return createPortal(
    <output
      aria-live="assertive"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 animate-in fade-in duration-500"
      style={{ animationTimingFunction: 'var(--ease-spring)' }}
    >
      <div className="text-center space-y-4 level-up-content">
        {/* Orbital ring animation */}
        <div className="relative mx-auto size-32">
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin-slow shadow-[var(--shadow-glow)]" />
          <div
            className="absolute inset-2 rounded-full border-2 border-primary/50 shadow-[var(--shadow-glow-sm)]"
            style={{ animation: 'spin 6s linear infinite reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-extrabold text-primary">{level}</span>
          </div>
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {t('gamification.levelUp.title')}
          </p>
          <p className="text-2xl font-extrabold text-text-primary mt-1">
            {t('gamification.levelUp.newLevel', { level })}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            {t('gamification.levelUp.subtitle', { title })}
          </p>
        </div>
      </div>
    </output>,
    document.body
  )
}
