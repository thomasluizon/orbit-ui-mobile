'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { AppBar } from '@/components/ui/app-bar'
import { useAstraSettingsController } from '@/components/profile/astra-settings-controller'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AiFeatureToggles } from './_components/ai-feature-toggles'

export default function AiSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const astraSettings = useAstraSettingsController(profile, patchProfile)

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('aiSettings.title')}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="stagger-enter">
            <AiFeatureToggles
              hasProAccess={hasProAccess}
              {...astraSettings}
              onUpgrade={() => router.push('/upgrade')}
            />
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  )
}
