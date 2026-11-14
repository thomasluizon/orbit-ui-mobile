'use client'

import { useTranslations } from 'next-intl'
import { PROGRESS_SUBMENUS } from '@orbit/shared/utils/progress-navigation'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { useFlag } from '@/hooks/use-flag'
import { GuidedProgressOverview } from './guided-progress-overview'
import { WindowSection } from './progress-window'

function ProgressOverview() {
  const t = useTranslations()
  return <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-col" data-progress-screen="overview">
    <RootNotificationHeader />
    <div className="flex min-w-0 flex-col gap-section-stack-gap px-screen-gutter py-4">
      <h1 className="sr-only" tabIndex={-1}>{t('progressScreen.title')}</h1>
      <WindowSection />
      <SettingsGroup>
        {PROGRESS_SUBMENUS.map((entry) => <ListRow key={entry.id} placement="column" textMode="label" icon={entry.icon} title={t(entry.labelKey)} description={entry.descriptionKey ? t(entry.descriptionKey) : undefined} href={entry.route} />)}
      </SettingsGroup>
    </div>
  </div>
}

/** With `orbit_guided_flows` off, the root renders its current form. */
export function ProgressOverviewRoute() {
  return useFlag('orbit_guided_flows') ? <GuidedProgressOverview /> : <ProgressOverview />
}
