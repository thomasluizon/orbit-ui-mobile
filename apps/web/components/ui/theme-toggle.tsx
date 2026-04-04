'use client'

import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useColorScheme } from '@/hooks/use-color-scheme'

export function ThemeToggle() {
  const { currentTheme, toggleTheme } = useColorScheme()
  const [isToggling, setIsToggling] = useState(false)

  async function handleToggle() {
    if (isToggling) return
    setIsToggling(true)
    try {
      toggleTheme()
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <button
      aria-label={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative size-9 flex items-center justify-center rounded-full bg-surface-elevated/60 hover:bg-surface-elevated border border-border-muted hover:border-border transition-all duration-200 active:scale-90 overflow-hidden"
      disabled={isToggling}
      onClick={handleToggle}
    >
      <div className="relative size-4">
        {/* Sun icon (shown when in dark mode - click to switch to light) */}
        <Sun
          className={`size-4 text-text-secondary absolute inset-0 transition-all duration-250 ${
            currentTheme === 'dark'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 rotate-90 scale-50'
          }`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        {/* Moon icon (shown when in light mode - click to switch to dark) */}
        <Moon
          className={`size-4 text-text-secondary absolute inset-0 transition-all duration-250 ${
            currentTheme === 'light'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 -rotate-90 scale-50'
          }`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </div>
    </button>
  )
}
