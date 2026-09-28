'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { WidgetInfoOverlay } from '@/components/advanced/advanced-sections'
import { PageHeader } from '@/components/ui/page-header'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Smartphone } from '@/components/ui/icons'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

export default function AdvancedPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col">
        <PageHeader
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('advancedSettings.title')}
        />
        <div className="stagger-enter min-h-0 flex-1">
          <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
          <SettingsRow
            label={t('profile.widgetTitle')}
            desc={t('profile.widgetHint')}
            icon={Smartphone}
            accessory="chevron"
            onClick={() => setShowWidgetInfo(true)}
            divider={false}
          />
        </div>
        <WidgetInfoOverlay open={showWidgetInfo} onOpenChange={setShowWidgetInfo} t={t} />
      </div>
    </div>
  )
}
