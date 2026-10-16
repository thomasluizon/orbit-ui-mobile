'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { PageHeader } from '@/components/ui/page-header'

export function ProgressSubscreen({ screen, children }: Readonly<{ screen: ProgressSubmenuId; children: ReactNode }>) {
  const router = useRouter()
  const t = useTranslations()
  return <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-col" data-progress-screen={screen}>
    <PageHeader title={t(`progressScreen.sections.${screen}`)} backLabel={t('progressScreen.back')} onBack={() => router.replace('/progress')} />
    <div className="flex min-w-0 flex-col gap-8 px-4 py-4">{children}</div>
  </div>
}
