import type { ThemeMode } from '@orbit/shared/types/profile'

export function statusBarStyleForTheme(theme: ThemeMode): 'light' | 'dark' {
  return theme === 'dark' ? 'light' : 'dark'
}
