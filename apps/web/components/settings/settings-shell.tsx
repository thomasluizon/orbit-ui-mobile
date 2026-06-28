'use client'

import { useEffect, useMemo, type ComponentType, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Info,
  LifeBuoy,
  SlidersHorizontal,
  Sparkles,
  User,
  Wrench,
  type LucideProps,
} from 'lucide-react'
import { useShellStore } from '@/stores/shell-store'
import { SettingsNav, type SettingsNavItem } from './settings-nav'

export type SettingsPanelId =
  | 'profile'
  | 'preferences'
  | 'ai-settings'
  | 'advanced'
  | 'about'
  | 'support'

interface SettingsPanelDef {
  id: SettingsPanelId
  route: string
  titleKey: string
  icon: ComponentType<LucideProps>
}

const SETTINGS_PANELS: readonly SettingsPanelDef[] = [
  { id: 'profile', route: '/profile', titleKey: 'nav.profile', icon: User },
  { id: 'preferences', route: '/preferences', titleKey: 'preferences.title', icon: SlidersHorizontal },
  { id: 'ai-settings', route: '/ai-settings', titleKey: 'aiSettings.title', icon: Sparkles },
  { id: 'advanced', route: '/advanced', titleKey: 'advancedSettings.title', icon: Wrench },
  { id: 'about', route: '/about', titleKey: 'about.title', icon: Info },
  { id: 'support', route: '/support', titleKey: 'profile.support.title', icon: LifeBuoy },
]

interface SettingsShellProps {
  panel: SettingsPanelId
  children: ReactNode
}

/**
 * Two-pane settings shell. On desktop (≥768px) it pairs a left panel nav with the
 * active panel's content on the right; below 768px it renders the page content
 * untouched (the nav hides itself, the wrappers collapse via `display: contents`).
 * Tracks the open panel through `shell-store.activeSettingsPanel`.
 */
export function SettingsShell({ panel, children }: Readonly<SettingsShellProps>) {
  const t = useTranslations()
  const router = useRouter()
  const activePanel = useShellStore((state) => state.activeSettingsPanel)
  const setActiveSettingsPanel = useShellStore((state) => state.setActiveSettingsPanel)

  useEffect(() => {
    setActiveSettingsPanel(panel)
  }, [panel, setActiveSettingsPanel])

  const items = useMemo<SettingsNavItem[]>(
    () =>
      SETTINGS_PANELS.map((def) => ({
        id: def.id,
        label: t(def.titleKey),
        icon: def.icon,
        onSelect: () => {
          setActiveSettingsPanel(def.id)
          router.push(def.route)
        },
      })),
    [t, router, setActiveSettingsPanel],
  )

  return (
    <div className="contents md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
      <SettingsNav
        items={items}
        activeId={activePanel ?? panel}
        title={t('settings.shellTitle')}
        subtitle={t('settings.shellSubtitle')}
        ariaLabel={t('settings.shellTitle')}
      />
      <div className="contents md:block md:min-w-0">{children}</div>
    </div>
  )
}
