import { act, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodayHeader } from '@/app/(app)/today-shell'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined }),
}))

vi.mock('@/hooks/use-gamification', () => ({
  useStreakInfo: () => ({ data: undefined }),
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

describe('Today header hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    document.cookie = 'orbit_theme_mode=; max-age=0; path=/'
    document.body.replaceChildren()
  })

  it('hydrates the dark server toggle when the browser theme cookie is light', async () => {
    document.cookie = 'orbit_theme_mode=light; path=/'
    const browserDocument = document
    vi.stubGlobal('document', undefined)
    let serverHtml: string
    try {
      serverHtml = renderToString(<TodayHeader streak={0} />)
    } finally {
      vi.stubGlobal('document', browserDocument)
    }

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)
    const recoverableError = vi.fn()

    await act(async () => {
      root = hydrateRoot(container, <TodayHeader streak={0} />, {
        onRecoverableError: recoverableError,
      })
    })

    expect(serverHtml).toContain('settings.theme.switchToLight')
    expect(recoverableError).not.toHaveBeenCalled()
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="settings.theme.switchToDark"]')
    expect(toggle).toBeInTheDocument()
    expect(toggle?.querySelector('svg')).toHaveClass('lucide-sun')

    fireEvent.click(toggle!)
    expect(toggle).toHaveAttribute('aria-label', 'settings.theme.switchToLight')
    expect(document.cookie).toContain('orbit_theme_mode=dark')
  })
})
